import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import StoreSettings from "../models/StoreSettings.js";
import { cancelShiprocketShipment, createReadyToShipShipment, extractCreatedShipmentIdentifiers, getShipmentTracking, markShipmentHandedOver, normalizeShiprocketStatus, requestShipmentPickup, resetShiprocketAuthForTests, syncShiprocketWebhook } from "../services/shiprocketService.js";

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

function mockAtomicTrackingUpdate(order) {
  Order.findOneAndUpdate = (filter, update) => {
    const fingerprint = update.$addToSet?.processedTrackingEvents;
    if (fingerprint && order.processedTrackingEvents?.includes(fingerprint)) return queryFor(null);
    Object.assign(order, update.$set || {});
    if (fingerprint) order.processedTrackingEvents = [...(order.processedTrackingEvents || []), fingerprint];
    if (update.$push?.trackingTimeline) order.trackingTimeline = [...(order.trackingTimeline || []), update.$push.trackingTimeline];
    return queryFor(order);
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

beforeEach(() => { resetShiprocketAuthForTests(); env.shiprocket.enabled = true; StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) }); });

afterEach(() => {
  resetShiprocketAuthForTests();
  Object.assign(env.shiprocket, originalShiprocket);
  StoreSettings.findOne = originalSettingsFind;
  Order.findById = originalFindById;
  Order.findOne = originalFindOne;
  Order.findOneAndUpdate = originalFindOneAndUpdate;
  globalThis.fetch = originalFetch;
});

test("Book Shipment creates an order and AWB without requesting pickup", async () => {
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
  assert.equal(ready.shippingStatus, "awb_assigned");
  assert.ok(ready.shipmentBookedAt instanceof Date);
  assert.deepEqual(ready.statusHistory.map((entry) => entry.status), ["shiprocket_order_created", "awb_assigned"]);
  assert.equal(paths.some((url) => url.includes("generate/pickup")), false);
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

test("mixed order booking sends exact snapshot weights, dimensions, SKUs, and COD method", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  order.products = [
    { ...order.products[0], quantity: 2, shippingWeight: 1.125, dimensions: { length: 9.25, width: 8.5, height: 27.75 }, variantSku: "OIL-1L", price: 300 },
    { ...order.products[0], variant: "64b000000000000000000024", variantLabel: "5L", variantSku: "OIL-5L", quantity: 1, shippingWeight: 5.45, dimensions: { length: 21.5, width: 16.25, height: 32.75 }, price: 1200 },
  ];
  order.shipmentDimensions = { length: 21.5, width: 16.25, height: 32.75 };
  order.subtotal = 1800;
  order.totalAmount = 1800;
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let createPayload;
  let serviceabilityUrl;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "live-token" }) };
    if (url.includes("/courier/serviceability/")) { serviceabilityUrl = new URL(url); return { ok: true, status: 200, text: async () => JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 42, courier_name: "Surface", rate: 100 }] } }) }; }
    if (url.endsWith("/orders/create/adhoc")) { createPayload = JSON.parse(options.body); return { ok: true, status: 200, text: async () => JSON.stringify({ order_id: "sr-order-1", shipment_id: "sr-shipment-1" }) }; }
    return { ok: true, status: 200, text: async () => JSON.stringify({ response: { data: { awb_code: "AWB123", courier_name: "Surface" } } }) };
  };

  await createReadyToShipShipment(order._id);
  assert.equal(serviceabilityUrl.searchParams.get("weight"), "7.7");
  assert.equal(serviceabilityUrl.searchParams.get("length"), "21.5");
  assert.equal(serviceabilityUrl.searchParams.get("breadth"), "16.25");
  assert.equal(serviceabilityUrl.searchParams.get("height"), "32.75");
  assert.equal(createPayload.weight, 7.7);
  assert.equal(createPayload.length, 21.5);
  assert.equal(createPayload.breadth, 16.25);
  assert.equal(createPayload.height, 32.75);
  assert.deepEqual(createPayload.order_items.map(({ sku, units, selling_price }) => ({ sku, units, selling_price })), [{ sku: "OIL-1L", units: 2, selling_price: 300 }, { sku: "OIL-5L", units: 1, selling_price: 1200 }]);
  assert.equal(createPayload.payment_method, "COD");
});

test("paid online orders are booked as Prepaid", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  order.paymentMethod = "cashfree";
  order.paymentStatus = "paid";
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let paymentMethod;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    if (url.includes("serviceability")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 42, rate: 50 }] } }) };
    if (url.endsWith("/orders/create/adhoc")) { paymentMethod = JSON.parse(options.body).payment_method; return { ok: true, status: 200, text: async () => JSON.stringify({ order_id: "sr-1", shipment_id: "shipment-1" }) }; }
    return { ok: true, status: 200, text: async () => JSON.stringify({ response: { data: { awb_code: "AWB1" } } }) };
  };
  await createReadyToShipShipment(order._id);
  assert.equal(paymentMethod, "Prepaid");
});

test("AWB failure preserves shipment ID and retry does not create a duplicate Shiprocket order", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let createCalls = 0;
  let assignmentCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    if (url.includes("serviceability")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 42, rate: 50 }] } }) };
    if (url.endsWith("/orders/create/adhoc")) { createCalls += 1; return { ok: true, status: 200, text: async () => JSON.stringify({ order_id: "sr-1", shipment_id: "shipment-1" }) }; }
    assignmentCalls += 1;
    return assignmentCalls === 1
      ? { ok: false, status: 503, text: async () => JSON.stringify({ message: "AWB temporarily unavailable" }) }
      : { ok: true, status: 200, text: async () => JSON.stringify({ response: { data: { awb_code: "AWB1" } } }) };
  };
  await assert.rejects(createReadyToShipShipment(order._id), /AWB assignment failed/i);
  assert.equal(order.shiprocketShipmentId, "shipment-1");
  assert.equal(order.awbCode, undefined);
  assert.equal(order.shippingStatus, "failed");
  await createReadyToShipShipment(order._id);
  assert.equal(createCalls, 1);
  assert.equal(order.awbCode, "AWB1");
});

test("Shiprocket order creation failure does not mark the order booked", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    if (url.includes("serviceability")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 42, rate: 50 }] } }) };
    return { ok: false, status: 422, text: async () => JSON.stringify({ message: "Invalid provider payload" }) };
  };
  await assert.rejects(createReadyToShipShipment(order._id), /order creation failed/i);
  assert.equal(order.shiprocketShipmentId, undefined);
  assert.equal(order.awbCode, undefined);
  assert.equal(order.shipmentBookedAt, undefined);
  assert.equal(order.shippingStatus, "failed");
});

test("serviceability timeout stops before Shiprocket order creation", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let createCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    if (url.endsWith("/orders/create/adhoc")) createCalls += 1;
    throw new DOMException("Timed out", "TimeoutError");
  };
  await assert.rejects(createReadyToShipShipment(order._id), /serviceability check failed/i);
  assert.equal(createCalls, 0);
  assert.equal(order.shippingStatus, "failed");
});

test("already-booked orders return without provider calls", async () => {
  const order = mockOrder();
  order.shiprocketOrderId = "sr-1";
  order.shiprocketShipmentId = "shipment-1";
  order.awbCode = "AWB1";
  order.shipmentEmailSentAt = new Date();
  Order.findById = () => queryFor(order);
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("must not call provider"); };
  assert.equal(await createReadyToShipShipment(order._id), order);
  assert.equal(providerCalls, 0);
});

test("Create Order identifiers support the official response and provider wrappers", () => {
  assert.deepEqual(extractCreatedShipmentIdentifiers({ order_id: 16161616, shipment_id: 15151515, status: "NEW", status_code: 1 }), { orderId: "16161616", shipmentId: "15151515", awbCode: "", courierName: "" });
  assert.deepEqual(extractCreatedShipmentIdentifiers({ response: { data: { order_id: 16161616, shipment_id: 15151515 } } }), { orderId: "16161616", shipmentId: "15151515", awbCode: "", courierName: "" });
  assert.deepEqual(extractCreatedShipmentIdentifiers({ order_id: 16161616, status: "NEW" }), { orderId: "16161616", shipmentId: "", awbCode: "", courierName: "" });
});

test("missing shipment id is reconciled from the persisted Shiprocket order before AWB assignment", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let createCalls = 0;
  globalThis.fetch = async (url) => {
    const body = url.endsWith("/auth/login") ? { token: "token" }
      : url.includes("serviceability") ? { data: { available_courier_companies: [{ courier_company_id: 42, rate: 50 }] } }
        : url.endsWith("/orders/create/adhoc") ? (createCalls += 1, { order_id: 16161616, status: "NEW", status_code: 1 })
          : url.endsWith("/orders/show/16161616") ? { data: { id: 16161616, shipments: [{ id: 15151515 }] } }
            : { response: { data: { awb_code: "AWB123", courier_name: "Surface" } } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const result = await createReadyToShipShipment(order._id);
  assert.equal(createCalls, 1);
  assert.equal(result.shiprocketOrderId, "16161616");
  assert.equal(result.shiprocketShipmentId, "15151515");
  assert.equal(result.awbCode, "AWB123");
});

test("ambiguous Create Order timeout reconciles once and never repeats creation", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let createCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    if (url.includes("serviceability")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 42, rate: 50 }] } }) };
    if (url.endsWith("/orders/create/adhoc")) { createCalls += 1; throw new DOMException("Timed out", "TimeoutError"); }
    if (url.includes("/orders?filter=")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 16161616, channel_order_id: order._id, shipments: [{ id: 15151515 }] }] }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ response: { data: { awb_code: "AWB123" } } }) };
  };
  const result = await createReadyToShipShipment(order._id);
  assert.equal(createCalls, 1);
  assert.equal(result.shiprocketShipmentId, "15151515");
  assert.equal(result.awbCode, "AWB123");
});

test("authentication failure stops before order creation", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "wrong", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let createCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/orders/create/adhoc")) createCalls += 1;
    return { ok: false, status: 401, text: async () => JSON.stringify({ message: "Unauthenticated" }) };
  };
  await assert.rejects(createReadyToShipShipment(order._id), /serviceability check failed/i);
  assert.equal(createCalls, 0);
});

test("invalid PIN and missing snapshot data fail before Shiprocket calls", async () => {
  const order = mockOrder();
  order.shippingAddress.postalCode = "56009";
  Order.findById = () => queryFor(order);
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("must not call provider"); };
  await assert.rejects(createReadyToShipShipment(order._id), /valid 6-digit shipping PIN/i);
  order.shippingAddress.postalCode = "560091";
  order.products[0].shippingWeight = undefined;
  Order.findOneAndUpdate = () => queryFor(order);
  await assert.rejects(createReadyToShipShipment(order._id), /weight is required/i);
  assert.equal(providerCalls, 0);
});

test("pickup is a separate idempotent admin operation", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  order.shiprocketShipmentId = "shipment-1";
  order.awbCode = "AWB1";
  order.shippingStatus = "awb_assigned";
  Order.findById = () => queryFor(order);
  Order.findOneAndUpdate = () => queryFor(order);
  let pickupCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    pickupCalls += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify({ pickup_status: "Pickup requested" }) };
  };
  await requestShipmentPickup(order._id);
  await requestShipmentPickup(order._id);
  assert.equal(pickupCalls, 1);
  assert.equal(order.shippingStatus, "pickup_generated");
  assert.ok(order.pickupRequestedAt instanceof Date);
});

test("signed Shiprocket updates preserve precise customer tracking states and verified dates", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.shippingStatus = "ready_for_pickup";
  order.statusHistory = [{ status: "ready_for_pickup", source: "shiprocket", createdAt: new Date("2026-09-03T08:00:00Z") }];
  Order.findOne = async () => order;
  mockAtomicTrackingUpdate(order);

  await syncShiprocketWebhook({ awb: "AWB123", current_status: "In Transit", event_time: "2026-09-03T10:30:00Z", tracking_url: "https://shiprocket.co/tracking/AWB123" }, { "x-api-key": "webhook-test-secret" });

  assert.equal(order.shippingStatus, "in_transit");
  assert.equal(order.orderStatus, "confirmed");
  assert.equal(order.trackingTimeline.at(-1).status, "in_transit");
  assert.equal(order.trackingTimeline.at(-1).occurredAt.toISOString(), "2026-09-03T10:30:00.000Z");
  assert.equal(order.trackingUrl, "https://shiprocket.co/tracking/AWB123");
});

test("Shiprocket webhook rejects untrusted external tracking links", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.awbCode = "AWB123";
  order.statusHistory = [];
  Order.findOne = async () => order;
  mockAtomicTrackingUpdate(order);

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
  mockAtomicTrackingUpdate(order);

  await syncShiprocketWebhook({ awb: "AWB123", current_status: "In Transit" }, { "x-api-key": "webhook-test-secret" });

  assert.equal(order.shippingStatus, "out_for_delivery");
  assert.equal(order.trackingTimeline.at(-1).status, "in_transit");
});

test("Shiprocket statuses normalize without treating unknown values as delivered", () => {
  assert.equal(normalizeShiprocketStatus("Picked Up"), "picked_up");
  assert.equal(normalizeShiprocketStatus("In Transit"), "in_transit");
  assert.equal(normalizeShiprocketStatus("Out For Delivery"), "out_for_delivery");
  assert.equal(normalizeShiprocketStatus("Delivered"), "delivered");
  assert.equal(normalizeShiprocketStatus("NDR - Undelivered"), "ndr");
  assert.equal(normalizeShiprocketStatus("RTO In Transit"), "rto");
  assert.equal(normalizeShiprocketStatus("Provider mystery state"), null);
});

test("duplicate and concurrent webhook deliveries create one timeline event", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.awbCode = "AWB123";
  Order.findOne = async () => order;
  mockAtomicTrackingUpdate(order);
  const payload = { awb: "AWB123", current_status: "Out For Delivery", event_time: "2026-09-03T10:30:00Z", activity: "Courier is out for delivery" };
  await Promise.all([syncShiprocketWebhook(payload, { "x-api-key": "webhook-test-secret" }), syncShiprocketWebhook(payload, { "x-api-key": "webhook-test-secret" })]);
  assert.equal(order.trackingTimeline.length, 1);
  assert.equal(order.shippingStatus, "out_for_delivery");
});

test("unknown webhook status is retained in history without changing shipment state", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  const order = mockOrder();
  order.awbCode = "AWB123";
  order.shippingStatus = "in_transit";
  Order.findOne = async () => order;
  mockAtomicTrackingUpdate(order);
  await syncShiprocketWebhook({ awb: "AWB123", current_status: "Provider mystery state", event_time: "2026-09-03T10:30:00Z" }, { "x-api-key": "webhook-test-secret" });
  assert.equal(order.shippingStatus, "in_transit");
  assert.equal(order.trackingTimeline[0].status, "unknown");
});

test("customer tracking uses only the order AWB and rejects another customer", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  order.awbCode = "AWB123";
  order.toJSON = () => ({ ...order });
  Order.findById = () => queryFor(order);
  mockAtomicTrackingUpdate(order);
  let trackingUrl;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    trackingUrl = url;
    return { ok: true, status: 200, text: async () => JSON.stringify({ tracking_data: { shipment_track_activities: [{ date: "2026-09-03T10:30:00Z", status: "In Transit", activity: "Package moving", location: "Bengaluru" }] } }) };
  };
  const result = await getShipmentTracking(order._id, { _id: order.user._id, role: "user" });
  assert.match(trackingUrl, /\/courier\/track\/awb\/AWB123$/);
  assert.equal(result.order.shiprocketShipmentId, undefined);
  assert.equal(result.order.trackingTimeline[0].location, "Bengaluru");
  await assert.rejects(getShipmentTracking(order._id, { _id: "different-user", role: "user" }), /cannot access/i);
});

test("shipment cancellation is blocked after pickup and succeeds before pickup", async () => {
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  const order = mockOrder();
  order.shiprocketOrderId = "12345";
  order.shiprocketShipmentId = "shipment-1";
  order.awbCode = "AWB123";
  order.shippingStatus = "picked_up";
  Order.findById = () => queryFor(order);
  await assert.rejects(cancelShiprocketShipment(order._id), /does not allow cancellation after courier pickup/i);
  order.shippingStatus = "ndr";
  await assert.rejects(cancelShiprocketShipment(order._id), /does not allow cancellation after courier pickup/i);
  order.shippingStatus = "awb_assigned";
  let cancelBody;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "token" }) };
    cancelBody = JSON.parse(options.body);
    return { ok: true, status: 204, text: async () => "" };
  };
  await cancelShiprocketShipment(order._id);
  assert.deepEqual(cancelBody, { ids: [12345] });
  assert.equal(order.shippingStatus, "cancelled");
  assert.equal(order.orderStatus, "confirmed");
});

test("Shiprocket webhook rejects an invalid token without processing the event", async () => {
  env.shiprocket.webhookSecret = "webhook-test-secret";
  let databaseCalls = 0;
  Order.findOne = async () => { databaseCalls += 1; return mockOrder(); };

  await assert.rejects(syncShiprocketWebhook({ awb: "AWB123", current_status: "Delivered" }, { "x-api-key": "wrong" }), /Invalid Shiprocket webhook token/);
  assert.equal(databaseCalls, 0);
});
