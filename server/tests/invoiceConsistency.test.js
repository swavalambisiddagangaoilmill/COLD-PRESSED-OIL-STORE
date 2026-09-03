import test from "node:test";
import assert from "node:assert/strict";
import { invoiceTotals } from "../../src/utils/invoicePdf.js";

const cases = [
  { name: "prepaid offer and coupon", paymentMethod: "cashfree", productSubtotal: 1950, offerDiscount: 100, subtotal: 1850, couponDiscount: 50, shippingAmount: 100, totalAmount: 1900 },
  { name: "COD offer and coupon", paymentMethod: "cod", productSubtotal: 1950, offerDiscount: 100, subtotal: 1850, couponDiscount: 50, shippingAmount: 100, totalAmount: 1900 },
  { name: "offer only", productSubtotal: 1950, offerDiscount: 100, subtotal: 1850, couponDiscount: 0, shippingAmount: 100, totalAmount: 1950 },
  { name: "coupon only", productSubtotal: 1850, offerDiscount: 0, subtotal: 1850, couponDiscount: 50, shippingAmount: 100, totalAmount: 1900 },
  { name: "no discount", productSubtotal: 1850, offerDiscount: 0, subtotal: 1850, couponDiscount: 0, shippingAmount: 100, totalAmount: 1950 },
];

for (const scenario of cases) {
  test(`invoice uses persisted breakdown for ${scenario.name}`, () => {
    assert.deepEqual(invoiceTotals({ ...scenario, total: 999999, products: [] }), {
      productSubtotal: scenario.productSubtotal,
      offerDiscount: scenario.offerDiscount,
      couponDiscount: scenario.couponDiscount,
      shipping: scenario.shippingAmount,
      grandTotal: scenario.totalAmount,
    });
  });
}

test("legacy invoice fallback derives its breakdown without overriding a stored final total", () => {
  const result = invoiceTotals({
    products: [{ basePrice: 350, price: 332.5, quantity: 2 }],
    shippingAmount: 100,
    couponDiscount: 25,
    totalAmount: 740,
  });
  assert.deepEqual(result, { productSubtotal: 700, offerDiscount: 35, couponDiscount: 25, shipping: 100, grandTotal: 740 });
});
