import test from "node:test";
import assert from "node:assert/strict";
import { customerOrderView, customerProductView } from "../utils/customerCommerceView.js";

test("customer product responses expose availability without inventory or shipment internals", () => {
  const result = customerProductView({
    _id: "product-1",
    sku: "GROUNDNUT-1",
    stock: 8,
    weight: 1,
    dimensions: { length: 5, width: 5, height: 10 },
    variants: [{ _id: "variant-1", litres: 1, sku: "GROUNDNUT-1L", stock: 8, shippingWeight: 1, dimensions: { length: 5, width: 5, height: 10 }, isActive: true }]
  });

  assert.equal(result.inStock, true);
  assert.equal(result.variants[0].isAvailable, true);
  for (const field of ["sku", "stock", "weight", "dimensions"]) assert.equal(field in result, false);
  for (const field of ["sku", "stock", "stockUnit", "shippingWeight", "dimensions"]) assert.equal(field in result.variants[0], false);
});

test("customer order responses omit provider, inventory, and parcel internals", () => {
  const result = customerOrderView({
    products: [{ title: "Groundnut Oil", variantSku: "GROUNDNUT-1L", shippingWeight: 1, dimensions: { length: 5, width: 5, height: 10 } }],
    shipmentWeight: 1,
    shipmentDimensions: { length: 5, width: 5, height: 10 },
    shiprocketOrderId: "provider-order",
    selectedCourierService: "Internal Courier",
    shiprocketShippingCost: 98,
    shippingCharge: 100,
    totalPrice: 500
  });

  assert.equal(result.shippingCharge, 100);
  assert.equal(result.totalPrice, 500);
  assert.equal("variantSku" in result.products[0], false);
  for (const field of ["shipmentWeight", "shipmentDimensions", "shiprocketOrderId", "selectedCourierService", "shiprocketShippingCost"]) assert.equal(field in result, false);
});
