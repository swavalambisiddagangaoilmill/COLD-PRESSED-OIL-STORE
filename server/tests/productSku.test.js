import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { createProduct, updateProduct } from "../services/productService.js";
import { generateProductSku, prepareProductVariants } from "../services/productSkuService.js";

const originalCategoryFindById = Category.findById;
const originalExists = Product.exists;
const originalCreate = Product.create;
const originalFindByIdAndUpdate = Product.findByIdAndUpdate;

afterEach(() => {
  Category.findById = originalCategoryFindById;
  Product.exists = originalExists;
  Product.create = originalCreate;
  Product.findByIdAndUpdate = originalFindByIdAndUpdate;
});

function mockCategory(category = { name: "Cold Pressed Oils", slug: "oils" }) {
  Category.findById = () => ({ select: () => ({ lean: async () => category }) });
}

test("product SKU generation resolves existing collisions", async () => {
  mockCategory();
  const existing = new Set(["OILS-GROUNDNUT-OI-1", "OILS-GROUNDNUT-OI-1-2"]);
  Product.exists = async ({ sku }) => existing.has(sku);

  const sku = await generateProductSku({ category: "category-id", title: "Groundnut Oil", weight: 1 });
  assert.equal(sku, "OILS-GROUNDNUT-OI-1-3");
});

test("new products ignore client SKU values and use the generated SKU", async () => {
  mockCategory();
  Product.exists = async () => false;
  let created;
  Product.create = async (data) => { created = data; return data; };

  await createProduct({ title: "Coconut Oil", category: "category-id", size: "500ml", weight: 99, sku: "CLIENT-SKU" });
  assert.equal(created.sku, "OILS-COCONUT-OIL-0-55");
  assert.equal(created.weight, 0.55);
  assert.notEqual(created.sku, "CLIENT-SKU");
});

test("product edits cannot replace the existing SKU", async () => {
  let updates;
  Product.findByIdAndUpdate = async (_id, data) => { updates = data; return { _id, sku: "EXISTING-SKU", ...data }; };

  const product = await updateProduct("product-id", { title: "Renamed", sku: "CLIENT-SKU" });
  assert.equal(Object.hasOwn(updates, "sku"), false);
  assert.equal(product.sku, "EXISTING-SKU");
});

test("one new variant receives a backend-generated SKU", async () => {
  Product.exists = async () => false;
  const variants = await prepareProductVariants([{ size: "1L", price: 200, mrp: 220, stock: 5, sku: "CLIENT" }], "OILS-COCONUT-1");
  assert.equal(variants[0].sku, "OILS-COCONUT-1-1L");
});

test("multiple same-size variants receive distinct SKUs", async () => {
  Product.exists = async () => false;
  const variants = await prepareProductVariants([
    { size: "1L", price: 200, mrp: 220, stock: 5 },
    { size: "1L", price: 190, mrp: 210, stock: 4 },
    { size: "5L", price: 900, mrp: 950, stock: 2 },
  ], "OILS-COCONUT-1");
  assert.deepEqual(variants.map(({ sku }) => sku), ["OILS-COCONUT-1-1L", "OILS-COCONUT-1-1L-2", "OILS-COCONUT-1-5L"]);
});

test("editing an existing variant preserves its SKU", async () => {
  Product.exists = async () => false;
  const variants = await prepareProductVariants(
    [{ _id: "variant-id", size: "2L", price: 400, mrp: 440, stock: 3, sku: "CLIENT" }],
    "OILS-COCONUT-1",
    [{ _id: "variant-id", sku: "EXISTING-VARIANT-SKU", shippingWeight: 8, dimensions: { length: 9, width: 8, height: 7 } }]
  );
  assert.equal(variants[0].sku, "EXISTING-VARIANT-SKU");
  assert.equal(variants[0].shippingWeight, 8);
  assert.deepEqual(variants[0].dimensions, { length: 9, width: 8, height: 7 });
});
