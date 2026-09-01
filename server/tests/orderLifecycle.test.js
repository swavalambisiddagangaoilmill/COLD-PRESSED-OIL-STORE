import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/Order.js";
import { updateOrderStatus } from "../services/orderService.js";

const originalFindById = Order.findById;
test.afterEach(() => { Order.findById = originalFindById; });

test("order lifecycle accepts the next valid transition", async () => {
  const order = { _id: "order-id", orderStatus: "placed", shippingStatus: "pending", save: async () => order };
  Order.findById = async () => order;
  const result = await updateOrderStatus("order-id", { orderStatus: "confirmed" });
  assert.equal(result.orderStatus, "confirmed");
});

test("order lifecycle rejects skipped and backward transitions", async () => {
  const order = { _id: "order-id", orderStatus: "confirmed", shippingStatus: "pending", save: async () => order };
  Order.findById = async () => order;
  await assert.rejects(() => updateOrderStatus("order-id", { orderStatus: "delivered" }), /Invalid order status transition/);
  await assert.rejects(() => updateOrderStatus("order-id", { orderStatus: "placed" }), /Invalid order status transition/);
});
