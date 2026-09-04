import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import StoreSettings from "../models/StoreSettings.js";
import { createReadyToShipShipment, markShipmentHandedOver, syncShiprocketWebhook } from "../services/shiprocketService.js";

const originalFindById = Order.findById;
const originalFindOne = Order.findOne;
const originalFindOneAndUpdate = Order.findOneAndUpdate;
const originalFetch = globalThis.fetch;
const originalShiprocket = { ...env.shiprocket };
const originalSettingsFind = StoreSettings.findOne;

function queryFor(order) {
  return {
    populate() { return this; },
    then(resolve) { return Promise.resolve(resolve(order)); },
  };
}

function mockOrder() {
  return {
    _id: "64b000000000000000000020",
    user: { _id: "64b000000000000000000021", name: "Test Customer", email: "test@example.com" },
    products: [{ product: { _id: "64b000000000000000000022" }, variant: "64b000000000000000000023", variantLabel: "1L", variantSku: "TEST-OIL-1L", title: "Test Oil", quantity: 1, price: 250, shippingWeight: 1.1, dimensions: { length: 10, width: 11, height: 30 }, requiredStockLitres: 1 }],
    shipmentDimensions: { length: 10, width: 11, height: 30 },
    shippingAddress: { fullName: "Test Customer", phone: "9999999999", street: "Test Road", city: "Tumakuru", state: "Karnataka", postalCode: "572106", country: "India" },
    paymentMethod: "cod",
    paymentStatus: "pending",
    orderStatus: "confirmed",
    shippingStatus: "pending",
    subtotal: 250,
    shippingAmount: 0,
    couponDiscount: 0,
    totalAmount: 250,
    mockShippingHistory: [],
    async save() { return this; },
  };
}

beforeEach(() => { env.shiprocket.enabled = true; StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) }); });

afterEach(() => {
  Object.assign(env.shiprocket, originalShiprocket);
  StoreSettings.findOne = originalSettingsFind;
  Order.findById = originalFindById;
  Order.findOne = originalFindOne;
  Order.findOneAndUpdate = originalFindOneAndUpdate;
  globalThis.fetch = originalFetch;
});

test("live Ready creates an order, AWB, and pickup from the order snapshot", async () => {
  Object.assign(env.shiprocket, {
    enabled: true,
    email: "shiprocket@example.com",
    password: "secret",
    pickupLocation: "Primary",
    pickupPostcode: "572106",
  });
  const order = mockOrder();
  order.createdAt = new Date("2026-09-02T00:00:00Z");
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(url);
    const body = url.endsWith("/auth/login")
      ? { token: "live-token" }
      : url.endsWith("/orders/create/adhoc")
        ? { order_id: "sr-order-1", shipment_id: "sr-shipment-1" }
        : url.includes("/courier/serviceability/")
          ? { data: { available_courier_companies: [{ courier_company_id: 42, courier_name: "Test Surface", freight_charge: 50, mode: "Surface" }] } }
          : url.endsWith("/courier/assign/awb")
            ? { response: { data: { awb_code: "AWB123" } } }
            : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };

  const ready = await createReadyToShipShipment(order._id);
  assert.equal(ready.shiprocketOrderId, "sr-order-1");
  assert.equal(ready.shiprocketShipmentId, "sr-shipment-1");
  assert.equal(ready.awbCode, "AWB123");
  assert.equal(ready.shippingStatus, "ready_for_pickup");
  assert.deepEqual(ready.statusHistory.map((entry) => entry.status), ["shiprocket_order_created", "awb_assigned", "pickup_generated", "packed", "ready_for_pickup"]);
  assert.equal(paths.some((url) => url.includes("generate/pickup")), true);
  assert.equal(paths.some((url) => url.includes("generate/label")), false);
  assert.equal(paths.some((url) => url.includes("manifests/generate")), false);
});

test("concurrent live Ready requests are blocked before a duplicate Shiprocket call", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(null);
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("must not call Shiprocket"); };

  await assert.rejects(createReadyToShipShipment(order._id), /already in progress/);
  assert.equal(networkCalls, 0);
});

test("signed Shiprocket updates preserve precise customer tracking states and verified dates", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.shippingStatus = "ready_for_pickup";
  order.statusHistory = [{ status: "ready_for_pickup", source: "shiprocket", createdAt: new Date("2026-09-03T08:00:00Z") }];
  Order.findOne = async () => order;

  await syncShiprocketWebhook({ awb: "AWB123", current_status: "In Transit", event_time: "2026-09-03T10:30:00Z", tracking_url: "https://shiprocket.co/tracking/AWB123" }, { "x-api-key": "webhook-test-secret" });

  assert.equal(order.shippingStatus, "in_transit");
  assert.equal(order.orderStatus, "shipped");
  assert.equal(order.statusHistory.at(-1).status, "in_transit");
  assert.equal(order.statusHistory.at(-1).createdAt.toISOString(), "2026-09-03T10:30:00.000Z");
  assert.equal(order.trackingUrl, "https://shiprocket.co/tracking/AWB123");
});

test("Shiprocket webhook rejects untrusted external tracking links", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.awbCode = "AWB123";
  order.statusHistory = [];
  Order.findOne = async () => order;

  await syncShiprocketWebhook({ awb: "AWB123", current_status: "Picked Up", tracking_url: "https://malicious.example/track" }, { "x-api-key": "webhook-test-secret" });

  assert.equal(order.shippingStatus, "picked_up");
  assert.equal(order.trackingUrl, "https://shiprocket.co/tracking/AWB123");
});

test("out-of-order Shiprocket webhook events cannot regress fulfillment", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.orderStatus = "shipped";
  order.shippingStatus = "out_for_delivery";
  order.statusHistory = [{ status: "out_for_delivery", source: "shiprocket", createdAt: new Date() }];
  Order.findOne = async () => order;

  await syncShiprocketWebhook({ awb: "AWB123", current_status: "In Transit" }, { "x-api-key": "webhook-test-secret" });

  assert.equal(order.shippingStatus, "out_for_delivery");
  assert.equal(order.statusHistory.length, 1);
});

test("Shiprocket webhook rejects an invalid token without processing the event", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  let databaseCalls = 0;
  Order.findOne = async () => { databaseCalls += 1; return mockOrder(); };

  await assert.rejects(syncShiprocketWebhook({ awb: "AWB123", current_status: "Delivered" }, { "x-api-key": "wrong" }), /Invalid Shiprocket webhook token/);
  assert.equal(databaseCalls, 0);
});
