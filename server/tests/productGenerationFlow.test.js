import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { createProduct } from "../services/productService.js";

const originalCategoryFindById = Category.findById;
const originalExists = Product.exists;
const originalCreate = Product.create;

afterEach(() => {
  Category.findById = originalCategoryFindById;
  Product.exists = originalExists;
  Product.create = originalCreate;
});

function installModelValidationMocks() {
  Category.findById = () => ({ select: () => ({ lean: async () => ({ name: "Oils", slug: "oils" }) }) });
  Product.exists = async () => false;
  Product.create = async (data) => {
    const product = new Product(data);
    await product.validate();
    return product;
  };
}

function payload(size, variants = []) {
  return {
    title: `Oil ${size}`,
    description: "Cold pressed oil",
    category: "64b000000000000000000001",
    size,
    price: 200,
    stock: 5,
    images: [{ url: "https://example.com/oil.jpg" }],
    variants,
  };
}

for (const [size, weight, dimensions] of [
  ["1L", 1.05, { length: 10, width: 10, height: 30 }],
  ["5L", 5.2, { length: 20, width: 15, height: 30 }],
  ["16.5L", 17.2, { length: 30, width: 25, height: 30 }],
]) {
  test(`product creation generates and validates automatic values for ${size}`, async () => {
    installModelValidationMocks();
    const product = await createProduct(payload(size));
    assert.ok(product.sku);
    assert.equal(product.weight, weight);
    assert.deepEqual(product.dimensions.toObject(), dimensions);
  });
}

test("product creation validates several fully generated variants", async () => {
  installModelValidationMocks();
  const product = await createProduct(payload("1L", [
    { size: "1L", price: 200, mrp: 220, stock: 5 },
    { size: "5L", price: 900, mrp: 950, stock: 2 },
    { size: "16.5L", price: 2800, mrp: 3000, stock: 1 },
  ]));
  assert.equal(product.variants.length, 3);
  assert.equal(new Set(product.variants.map((variant) => variant.sku)).size, 3);
  assert.deepEqual(product.variants.map((variant) => variant.shippingWeight), [1.05, 5.2, 17.2]);
  assert.ok(product.variants.every((variant) => variant.dimensions.length > 0 && variant.dimensions.width > 0 && variant.dimensions.height > 0));
});

test("model validation rejects invalid variant price, MRP, stock, and images", async () => {
  installModelValidationMocks();
  await assert.rejects(
    () => createProduct(payload("1L", [{ size: "1L", price: 0, mrp: 0, stock: -1, images: [{ url: "" }] }])),
    { name: "ValidationError" }
  );
});

test("model validation rejects a variant MRP below its price", async () => {
  installModelValidationMocks();
  await assert.rejects(
    () => createProduct(payload("1L", [{ size: "1L", price: 220, mrp: 200, stock: 1 }])),
    /MRP cannot be lower/
  );
});
