import assert from "node:assert/strict";
import test from "node:test";
import { shipmentDataFromOrder, shipmentDataFromProducts } from "../services/shipmentDataService.js";

const variant = (id, size, weight, dimensions) => ({ _id: id, size, litres: Number.parseFloat(size), sku: `OIL-${size}`, price: 100, shippingWeight: weight, dimensions, images: [{ url: `https://example.com/${id}.jpg` }] });

test("mixed variants preserve exact line dimensions and sum stored weights", () => {
  const one = variant("v1", "1L", 1.125, { length: 9.25, width: 8.5, height: 27.75 });
  const five = variant("v5", "5L", 5.45, { length: 21.5, width: 16.25, height: 32.75 });
  const product = { _id: "p1", variants: [one, five], images: [] };
  const shipment = shipmentDataFromProducts([{ product, variant: "v1", quantity: 2 }, { product, variant: "v5", quantity: 1 }]);

  assert.equal(shipment.weight, 7.7);
  assert.deepEqual(shipment.lines[0].dimensions, one.dimensions);
  assert.deepEqual(shipment.lines[1].dimensions, five.dimensions);
  assert.deepEqual(shipment.dimensions, five.dimensions);
  assert.equal(shipment.lines[0].requiredStockLitres, 2);
  assert.equal(shipment.lines[1].requiredStockLitres, 5);
});

test("shipment booking reads immutable order snapshots, not current products", () => {
  const order = {
    products: [{ quantity: 3, shippingWeight: 1.2, dimensions: { length: 10.1, width: 9.2, height: 28.3 } }],
    shipmentDimensions: { length: 10.1, width: 9.2, height: 28.3 },
  };
  assert.deepEqual(shipmentDataFromOrder(order), {
    lines: [{ quantity: 3, shippingWeight: 1.2, dimensions: { length: 10.1, width: 9.2, height: 28.3 } }],
    weight: 3.6,
    dimensions: { length: 10.1, width: 9.2, height: 28.3 },
  });
});

test("missing real shipping measurements are rejected without defaults", () => {
  const product = { _id: "p1", variants: [variant("v1", "1L", undefined, { length: 10, width: 10, height: 30 })] };
  assert.throws(() => shipmentDataFromProducts([{ product, variant: "v1", quantity: 1 }]), /Variant weight is required/);
});
