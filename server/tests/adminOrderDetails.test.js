import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { withOrderTotals } from "../utils/orderTotals.js";

const adminPage = () => readFile(
  new URL("../../src/admin/pages/AdminPages.jsx", import.meta.url),
  "utf8",
);

test("admin order rows open the selected persisted order and ignore interactive controls", async () => {
  const source = await adminPage();
  assert.match(source, /onClick=\{\(event\) => openRow\(event, order\)\}/);
  assert.match(source, /onOpen=\{setSelectedOrder\}/);
  assert.match(source, /order=\{selectedOrder\}/);
  assert.match(source, /button,a,input,select,textarea/);
  assert.match(source, /event\.target !== event\.currentTarget/);
});

test("admin popup renders historical item, total, address, and shipment snapshots", async () => {
  const source = await adminPage();
  for (const field of [
    "variantSku",
    "basePrice",
    "offerDiscount",
    "requiredStockLitres",
    "shippingWeight",
    "dimensions?.length",
    "dimensions?.width",
    "dimensions?.height",
    "productSubtotal",
    "couponDiscount",
    "shippingAmount",
    "totalAmount",
    "shippingAddress",
    "billingAddress",
    "shiprocketOrderId",
    "shiprocketShipmentId",
    "awbCode",
    "lastTrackingSyncAt",
  ]) assert.ok(source.includes(field), field);
  assert.doesNotMatch(source, /adminApi\.products\([^)]*selectedOrder/);
});

test("admin totals helper retains persisted historical values without product lookups", () => {
  const historical = withOrderTotals({
    products: [{
      title: "Groundnut Oil",
      variantLabel: "1L",
      variantSku: "GROUNDNUT-1L-HISTORICAL",
      quantity: 2,
      basePrice: 350,
      price: 332.5,
      lineTotal: 665,
      offerDiscount: 17.5,
      lineOfferDiscount: 35,
      requiredStockLitres: 2,
      shippingWeight: 1,
      dimensions: { length: 5, width: 5, height: 10 },
    }],
    productSubtotal: 700,
    offerDiscount: 35,
    subtotal: 665,
    couponDiscount: 15,
    shippingAmount: 100,
    totalAmount: 750,
  });
  assert.equal(historical.products[0].total, 665);
  assert.equal(historical.products[0].variantSku, "GROUNDNUT-1L-HISTORICAL");
  assert.deepEqual(historical.products[0].dimensions, { length: 5, width: 5, height: 10 });
  assert.deepEqual(
    [historical.productSubtotal, historical.offerDiscount, historical.couponDiscount, historical.shippingAmount, historical.totalAmount],
    [700, 35, 15, 100, 750],
  );
});
