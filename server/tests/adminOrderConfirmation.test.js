import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Order from "../models/Order.js";
import { updateOrderStatus } from "../admin/services/adminDataService.js";

const originalFindById = Order.findById;

afterEach(() => { Order.findById = originalFindById; });

test("admin confirmation records the real transition once and repeated confirmation is idempotent", async () => {
  let saves = 0;
  const order = {
    _id: "64b000000000000000000030",
    user: { email: "customer@example.com" },
    products: [{ title: "Groundnut Oil", quantity: 2 }],
    totalAmount: 500,
    paymentStatus: "paid",
    orderStatus: "placed",
    shippingStatus: "pending",
    statusHistory: [{ status: "placed", source: "order", createdAt: new Date("2026-09-02T10:00:00Z") }],
    async save() { saves += 1; return this; },
  };
  Order.findById = async () => order;

  const confirmed = await updateOrderStatus(order._id, "confirmed");
  const repeated = await updateOrderStatus(order._id, "confirmed");

  assert.equal(confirmed.orderStatus, "confirmed");
  assert.equal(repeated, confirmed);
  assert.ok(confirmed.confirmedAt instanceof Date);
  assert.equal(confirmed.statusHistory.filter((entry) => entry.status === "confirmed").length, 1);
  assert.equal(saves, 1);
});
