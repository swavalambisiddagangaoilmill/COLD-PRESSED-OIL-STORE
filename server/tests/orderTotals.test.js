import test from "node:test";
import assert from "node:assert/strict";
import { orderItemTotal, withOrderTotals } from "../utils/orderTotals.js";

test("historical item totals fall back to saved price times quantity", () => {
  assert.equal(orderItemTotal({ price: 275, quantity: 3 }), 825);
  assert.equal(orderItemTotal({ total: 700, price: 275, quantity: 3 }), 700);
});

test("historical order totals preserve snapshots and derive missing totals", () => {
  const order = withOrderTotals({ products: [{ price: 250, quantity: 2 }, { price: 100, quantity: 1 }], shippingAmount: 50, couponDiscount: 25 });
  assert.equal(order.subtotal, 600);
  assert.equal(order.totalAmount, 625);
  assert.deepEqual(order.products.map((item) => item.total), [500, 100]);
});
