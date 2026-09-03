import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { createProduct, updateProduct } from "../services/productService.js";
import { generateProductSku, prepareProductVariants } from "../services/productSkuService.js";

const originalCategoryFindById = Category.findById;
const originalExists = Product.exists;
const originalCreate = Product.create;
const originalFindOne = Product.findOne;
const originalFindByIdAndUpdate = Product.findByIdAndUpdate;

afterEach(() => {
  Category.findById = originalCategoryFindById;
  Product.exists = originalExists;
  Product.create = originalCreate;
  Product.findOne = originalFindOne;
  Product.findByIdAndUpdate = originalFindByIdAndUpdate;
});

function mockCategory(category = { name: "Coconut Oil", slug: "coconut-oil" }) {
  Category.findById = () => ({ select: () => ({ lean: async () => category }) });
}

test("product SKU generation resolves existing collisions", async () => {
  mockCategory();
  const existing = new Set(["COCONUT--GROUNDNUT-OI-1", "COCONUT--GROUNDNUT-OI-1-2"]);
  Product.exists = async ({ sku }) => existing.has(sku);

  const sku = await generateProductSku({ category: "category-id", title: "Groundnut Oil", weight: 1 });
  assert.equal(sku, "COCONUT--GROUNDNUT-OI-1-3");
});

test("new products ignore client SKU values and use the generated SKU", async () => {
  mockCategory();
  Product.exists = async () => false;
  let created;
  Product.create = async (data) => { created = data; return data; };

  await createProduct({ title: "Coconut Oil", category: "category-id", size: "500ml", weight: 99, sku: "CLIENT-SKU" });
  assert.equal(created.sku, "COCONUT--COCONUT-OIL-0-55");
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

test("a concurrent product SKU collision is retried safely", async () => {
  mockCategory();
  let collisionRecorded = false;
  let collidedSku;
  Product.exists = async ({ sku }) => collisionRecorded && sku === collidedSku;
  Product.create = async (data) => {
    if (!collisionRecorded) {
      collisionRecorded = true;
      collidedSku = data.sku;
      throw Object.assign(new Error("duplicate product SKU"), { code: 11000, keyPattern: { sku: 1 }, keyValue: { sku: data.sku } });
    }
    return data;
  };

  const product = await createProduct({ title: "Race Safe Oil", description: "Cold pressed", category: "category-id", size: "1L", price: 200, stock: 1, images: [] });
  assert.equal(product.sku, "COCONUT--RACE-SAFE-OI-1-05-2");
});

test("a concurrent variant SKU collision is retried safely", async () => {
  mockCategory();
  let collisionRecorded = false;
  let collidedSku;
  Product.exists = async (filter) => collisionRecorded && filter["variants.sku"] === collidedSku;
  Product.create = async (data) => {
    if (!collisionRecorded) {
      collisionRecorded = true;
      collidedSku = data.variants[0].sku;
      throw Object.assign(new Error("duplicate variant SKU"), { code: 11000, keyPattern: { "variants.sku": 1 }, keyValue: { "variants.sku": data.variants[0].sku } });
    }
    return data;
  };

  const product = await createProduct({ title: "Variant Race Oil", description: "Cold pressed", category: "category-id", size: "1L", price: 200, stock: 1, images: [], variants: [{ size: "1L", price: 200, mrp: 220, stock: 1, images: [] }] });
  assert.equal(product.variants[0].sku, "COCONUT--VARIANT-RACE-1-05-1L-2");
});

test("an identical repeated create request returns the existing product", async () => {
  mockCategory();
  Product.exists = async () => false;
  const payload = { title: "Idempotent Oil", description: "Cold pressed", category: "category-id", size: "1L", price: 200, stock: 1, images: [] };
  const existing = { _id: "existing-id", ...payload, slug: "idempotent-oil", sku: "OILS-IDEMPOTENT-1", variants: [] };
  Product.create = async () => { throw Object.assign(new Error("duplicate slug"), { code: 11000, keyPattern: { slug: 1 }, keyValue: { slug: "idempotent-oil" } }); };
  Product.findOne = async () => existing;

  assert.equal(await createProduct(payload), existing);
});

test("a conflicting duplicate title receives a field-specific validation error", async () => {
  mockCategory();
  Product.exists = async () => false;
  Product.create = async () => { throw Object.assign(new Error("duplicate slug"), { code: 11000, keyPattern: { slug: 1 }, keyValue: { slug: "existing-oil" } }); };
  Product.findOne = async () => ({ title: "Existing Oil", description: "Original", category: "category-id", size: "1L", price: 200, stock: 1, images: [], variants: [] });

  await assert.rejects(
    () => createProduct({ title: "Existing Oil", description: "Different", category: "category-id", size: "1L", price: 200, stock: 1, images: [] }),
    (error) => error.statusCode === 409 && error.errors?.[0]?.field === "title" && /title already exists/i.test(error.message)
  );
});

test("an unrecoverable duplicate SKU receives a field-specific validation error", async () => {
  mockCategory();
  Product.exists = async () => false;
  Product.create = async (data) => {
    throw Object.assign(new Error("duplicate SKU"), { code: 11000, keyPattern: { sku: 1 }, keyValue: { sku: data.sku } });
  };

  await assert.rejects(
    () => createProduct({ title: "Duplicate SKU Oil", description: "Cold pressed", category: "category-id", size: "1L", price: 200, stock: 1, images: [] }),
    (error) => error.statusCode === 409 && error.errors?.[0]?.field === "sku" && /SKU already exists/i.test(error.message)
  );
});
