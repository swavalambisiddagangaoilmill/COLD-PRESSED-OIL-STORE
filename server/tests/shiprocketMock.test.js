import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import { advanceMockShipment, createReadyToShipShipment, getShipmentTracking, markShipmentHandedOver } from "../services/shiprocketService.js";

const originalFindById = Order.findById;
const originalFetch = globalThis.fetch;
const originalMock = env.shiprocket.mock;

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
    products: [{ product: { _id: "64b000000000000000000022" }, title: "Test Oil", quantity: 1, price: 250 }],
    shippingAddress: { fullName: "Test Customer", phone: "9999999999", street: "Test Road", city: "Tumakuru", state: "Karnataka", postalCode: "572106", country: "India" },
    paymentMethod: "cod",
    paymentStatus: "pending",
    orderStatus: "confirmed",
    shippingStatus: "pending",
    totalAmount: 250,
    mockShippingHistory: [],
    async save() { return this; },
  };
}

beforeEach(() => { env.shiprocket.mock = true; });

afterEach(() => {
  env.shiprocket.mock = originalMock;
  Order.findById = originalFindById;
  globalThis.fetch = originalFetch;
});

test("mock Ready to Shipping lifecycle never calls real Shiprocket APIs", async () => {
  const order = mockOrder();
  Order.findById = () => queryFor(order);
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("Real Shiprocket API must not be called in mock mode"); };

  const ready = await createReadyToShipShipment(order._id);
  assert.equal(ready.isMockShipment, true);
  assert.equal(ready.shippingStatus, "ready_for_pickup");
  assert.match(ready.awbCode, /^MOCK-AWB-/);

  const tracking = await getShipmentTracking(order._id, { role: "admin" });
  assert.equal(tracking.steps.length, 6);

  const handedOver = await markShipmentHandedOver(order._id);
  assert.equal(handedOver.shippingStatus, "picked_up");
  assert.ok(handedOver.handedOverAt instanceof Date);

  const shipped = await advanceMockShipment(order._id);
  assert.equal(shipped.shippingStatus, "shipped");
  assert.equal(shipped.orderStatus, "shipped");
  assert.equal(networkCalls, 0);
});

test("mock-only controls remain blocked when live mode is selected", async () => {
  env.shiprocket.mock = false;
  Order.findById = () => queryFor(mockOrder());
  await assert.rejects(advanceMockShipment("64b000000000000000000020"), /Mock Shiprocket mode is disabled/);
});
