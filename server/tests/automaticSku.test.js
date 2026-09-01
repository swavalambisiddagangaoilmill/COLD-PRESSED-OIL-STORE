import test from "node:test";
import assert from "node:assert/strict";
import Product from "../models/Product.js";
import { createProduct, generateProductSku, generateVariantSku, updateProduct } from "../services/productService.js";

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
  const current = new Product({ sku: "PRD-EXIST-ABC123", title: "Existing", slug: "existing", description: "Existing", variants: [variant("1L", "PRD-EXIST-ABC123-1L-AAAA")] });
  current.save = async () => current;
  Product.findById = async () => current;
  try {
    const existingId = String(current.variants[0]._id);
    await updateProduct(String(current._id), { title: "Renamed", sku: "FORGED", variants: [{ ...variant("1L", "FORGED-VARIANT"), _id: existingId }, variant("5L", "FORGED-NEW")] });
    assert.equal(current.sku, "PRD-EXIST-ABC123");
    assert.equal(current.variants.id(existingId).sku, "PRD-EXIST-ABC123-1L-AAAA");
    assert.match(current.variants.find((item) => item.name === "5L").sku, /^PRD-EXIST-ABC123-5L-[A-F0-9]{4}$/);
  } finally { Product.findById = originalFindById; }
});
