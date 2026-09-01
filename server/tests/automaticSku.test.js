import test from "node:test";
import assert from "node:assert/strict";
import Product from "../models/Product.js";
import { createProduct, generateProductSku, generateVariantSku, updateProduct } from "../services/productService.js";
import { saveProduct as saveAdminProduct } from "../admin/services/adminDataService.js";
import { getVariantShippingDefaults, parseVariantVolume } from "../utils/variantShippingDefaults.js";

const variant = (name, sku) => ({ name, sku, price: 100, mrp: 120, stock: 1, weight: 1, dimensions: { length: 1, width: 1, height: 1 }, images: [{ url: "image.jpg" }], isActive: true });

test("new products and variants receive server-generated URL-safe unique SKUs", async () => {
  const originalCreate = Product.create;
  let saved;
  Product.create = async (value) => { saved = value; return value; };
  try {
    await createProduct({ title: "Groundnut Oil", description: "Cold pressed", variants: [variant("1L", "CLIENT-SKU"), variant("5L", "CLIENT-SKU-2")] });
    assert.match(saved.sku, /^PRD-GROUNDNU-[A-F0-9]{6}$/);
    assert.equal(new Set(saved.variants.map((item) => item.sku)).size, 2);
    assert.equal(saved.variants.some((item) => item.sku.startsWith(`${saved.sku}-`)), true);
    assert.equal(JSON.stringify(saved).includes("CLIENT-SKU"), false);
    assert.deepEqual(saved.variants[0].dimensions, { length: 10, width: 10, height: 30 });
    assert.equal(saved.variants[0].weight, 1.05);
    assert.deepEqual(saved.variants[1].dimensions, { length: 20, width: 15, height: 30 });
    assert.equal(saved.variants[1].weight, 5);
  } finally { Product.create = originalCreate; }
});

test("admin product creation generates and validates all internal 1L variant fields before save", async () => {
  const originalCreate = Product.create;
  let saved;
  Product.create = async (value) => {
    const product = new Product(value);
    await product.validate();
    saved = product;
    return product;
  };
  try {
    await saveAdminProduct({
      title: "Test Groundnut Oil",
      description: "Fresh cold pressed oil",
      variants: [{ name: "1L", price: 1000, mrp: 1500, stock: 3, images: [{ url: "https://res.cloudinary.com/demo/image/upload/product.webp", publicId: "products/test" }], isActive: true }],
      isActive: true,
    });
    assert.match(saved.sku, /^PRD-TESTGROU-[A-F0-9]{6}$/);
    assert.equal(saved.variants[0].name, "1L");
    assert.match(saved.variants[0].sku, new RegExp(`^${saved.sku}-1L-[A-F0-9]{4}$`));
    assert.equal(saved.variants[0].price, 1000);
    assert.equal(saved.variants[0].mrp, 1500);
    assert.equal(saved.variants[0].stock, 3);
    assert.equal(saved.variants[0].images[0].url, "https://res.cloudinary.com/demo/image/upload/product.webp");
    assert.equal(saved.variants[0].weight, 1.05);
    assert.deepEqual(saved.variants[0].dimensions.toObject(), { length: 10, width: 10, height: 30 });
  } finally { Product.create = originalCreate; }
});

test("SKU generators are collision-resistant and database-safe", () => {
  const products = new Set(Array.from({ length: 100 }, () => generateProductSku("Groundnut Oil")));
  const variants = new Set(Array.from({ length: 100 }, () => generateVariantSku("PRD-GROUND-ABC123", "1 litre")));
  assert.equal(products.size, 100);
  assert.equal(variants.size, 100);
  assert.equal([...products, ...variants].every((sku) => /^[A-Z0-9-]+$/.test(sku)), true);
});

test("editing preserves existing product and variant SKUs and generates only new variant SKUs", async () => {
  const originalFindById = Product.findById;
  const current = new Product({ sku: "PRD-EXIST-ABC123", title: "Existing", slug: "existing", description: "Existing", variants: [{ ...variant("1L", "PRD-EXIST-ABC123-1L-AAAA"), weight: 9.9, dimensions: { length: 99, width: 98, height: 97 } }] });
  current.save = async () => current;
  Product.findById = async () => current;
  try {
    const existingId = String(current.variants[0]._id);
    await updateProduct(String(current._id), { title: "Renamed", sku: "FORGED", variants: [{ ...variant("1L", "FORGED-VARIANT"), _id: existingId }, variant("5L", "FORGED-NEW")] });
    assert.equal(current.sku, "PRD-EXIST-ABC123");
    assert.equal(current.variants.id(existingId).sku, "PRD-EXIST-ABC123-1L-AAAA");
    assert.equal(current.variants.id(existingId).weight, 9.9);
    assert.deepEqual(current.variants.id(existingId).dimensions.toObject(), { length: 99, width: 98, height: 97 });
    assert.match(current.variants.find((item) => item.name === "5L").sku, /^PRD-EXIST-ABC123-5L-[A-F0-9]{4}$/);
    assert.equal(current.variants.find((item) => item.name === "5L").weight, 5);
  } finally { Product.findById = originalFindById; }
});

test("shipping defaults cover presets and deterministic additional volumes", () => {
  assert.deepEqual(getVariantShippingDefaults("16.5L"), { name: "16.5L", volumeLitres: 16.5, weight: 16.5, dimensions: { length: 30, width: 25, height: 30 } });
  for (const size of ["250ml", "500ml", "750ml", "2L", "10L", "20L"]) {
    const first = getVariantShippingDefaults(size), second = getVariantShippingDefaults(size);
    assert.deepEqual(first, second);
    assert.ok(first.weight > 0);
    assert.equal(Object.values(first.dimensions).every((value) => value > 0), true);
  }
});

test("invalid or non-positive volume sizes are rejected", () => {
  for (const size of ["", "large", "0L", "-1L", "500", "101L"]) assert.throws(() => parseVariantVolume(size), /volume/i);
});
