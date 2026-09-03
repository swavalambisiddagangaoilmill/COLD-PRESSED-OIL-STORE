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

test("order breakdown preserves product, offer, coupon, shipping, and authoritative final totals", () => {
  const order = withOrderTotals({
    products: [{ basePrice: 975, price: 925, quantity: 2, lineOfferDiscount: 100 }],
    subtotal: 1850,
    shippingAmount: 100,
    couponDiscount: 50,
    totalAmount: 1900,
  });
  assert.equal(order.productSubtotal, 1950);
  assert.equal(order.offerDiscount, 100);
  assert.equal(order.couponDiscount, 50);
  assert.equal(order.shippingAmount, 100);
  assert.equal(order.totalAmount, 1900);
});
