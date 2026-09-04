import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { mergeRequestedCartItems } from "../services/cartService.js";
import { priceProduct } from "../services/offerPricingService.js";
import { normalizeCartItem } from "../../src/services/cartService.js";
import { availableVariantQuantity, requiredStockLitres, variantLitres } from "../services/variantInventoryService.js";

const ids = [1, 2, 3].map((number) => new mongoose.Types.ObjectId(`64b00000000000000000000${number}`));
const product = { _id: ids[0], title: "Oil", category: "c1", price: 100, stock: 9, variants: [
  { _id: ids[1], size: "1L", litres: 1, sku: "OIL-1L", price: 500, mrp: 550, isActive: true, images: [{ url: "/one.jpg" }] },
  { _id: ids[2], size: "5L", litres: 5, sku: "OIL-5L", price: 2000, mrp: 2200, isActive: true, images: [{ url: "/five.jpg" }] },
] };

test("different variants of the same product remain separate cart lines", () => {
  const merged = mergeRequestedCartItems([], [{ product: ids[0], variant: ids[1], quantity: 1 }, { product: ids[0], variant: ids[2], quantity: 2 }]);
  assert.equal(merged.size, 2);
});

test("the same product and variant merges quantities", () => {
  const merged = mergeRequestedCartItems([{ product: ids[0], variant: ids[1], quantity: 1 }], [{ productId: ids[0], variantId: ids[1], quantity: 2 }]);
  assert.equal([...merged.values()][0].quantity, 3);
});

test("cart normalization selects variant price image availability and label without exposing SKU", () => {
  const item = normalizeCartItem({ product: priceProduct(product, []), variant: ids[2], quantity: 1 });
  assert.deepEqual([item.price, item.image, item.stock, item.sku, item.volume], [2000, "/five.jpg", 1, undefined, "5L"]);
});

test("variant offer pricing is calculated independently from its base selling price", () => {
  const offer = { _id: "o1", name: "Ten", targetType: "VARIANT", variants: [{ product: ids[0], variant: ids[2] }], discountType: "PERCENTAGE", discountValue: 10, isActive: true, startDate: "2026-01-01", endDate: "2027-01-01" };
  const priced = priceProduct(product, [offer], new Date("2026-09-03"));
  assert.deepEqual([priced.variants[0].effectivePrice, priced.variants[1].effectivePrice], [500, 1800]);
});

test("variant cart identity survives normalization", () => {
  const item = normalizeCartItem({ product: priceProduct(product, []), variant: ids[1], quantity: 1 });
  assert.equal(item.cartKey, `${ids[0]}:${ids[1]}`);
  assert.equal(String(item.variantId), String(ids[1]));
});

test("inactive variant state is retained by the schema", () => {
  const path = Product.schema.path("variants").schema.path("isActive");
  assert.equal(path.defaultValue, true);
});

test("order snapshots expose required variant fields", async () => {
  const Order = (await import("../models/Order.js")).default;
  const schema = Order.schema.path("products").schema;
  for (const field of ["variant", "variantLabel", "variantSku", "shippingWeight", "dimensions", "requiredStockLitres", "basePrice", "offerId", "offerName", "offerDiscount"]) assert.ok(schema.path(field), field);
});

test("legacy product-only cart rows remain valid", () => {
  const item = normalizeCartItem({ product: { _id: ids[0], title: "Oil", price: 100, discountPrice: 90, stock: 3 }, quantity: 1 });
  assert.deepEqual([item.variantId, item.price, item.stock], [null, 90, 3]);
});

for (const [size, quantity, expected] of [["1L", 1, 1], ["1L", 5, 5], ["5L", 1, 5], ["5L", 3, 15], ["16.5L", 1, 16.5], ["16.5L", 2, 33]]) {
  test(`${size} × ${quantity} consumes ${expected} litres`, () => {
    assert.equal(requiredStockLitres({ size }, quantity), expected);
  });
}

test("available order quantity is derived from litre stock", () => {
  assert.equal(availableVariantQuantity({ size: "5L" }, 12), 2);
  assert.equal(availableVariantQuantity({ size: "16.5L" }, 49.5), 3);
});

test("stored litre value is authoritative over the display label", () => {
  assert.equal(variantLitres({ size: "5L", litres: 16.5 }), 16.5);
});
