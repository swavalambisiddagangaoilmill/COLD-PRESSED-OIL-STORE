import assert from "node:assert/strict";
import { test } from "node:test";
import Category from "../models/Category.js";
import { updateCategory } from "../services/categoryService.js";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_SLUGS, isCanonicalProductCategory } from "../../shared/productCategories.js";

const expected = [
  "Flax Seed Oil", "Safflower Oil", "Sunflower Oil", "Coconut Oil", "Castor Oil", "Badam Oil", "White Sesame Oil",
  "Black Sesame Oil", "Niger Seed Oil", "Mustard Oil", "Groundnut Oil", "Neem Oil", "Herbal Oil", "Caranja Oil",
];

test("the category source contains the exact 14 canonical labels in order", () => {
  assert.deepEqual(PRODUCT_CATEGORIES, expected);
  assert.equal(PRODUCT_CATEGORY_SLUGS.length, 14);
});

test("canonical category names and matching slugs validate", async () => {
  for (const category of PRODUCT_CATEGORY_SLUGS) {
    await new Category(category).validate();
    assert.equal(isCanonicalProductCategory(category.name, category.slug), true);
  }
});

test("obsolete and mismatched categories are rejected", async () => {
  await assert.rejects(() => new Category({ name: "Raw Material Crushing", slug: "raw-material-crushing" }).validate(), /not a valid enum value/);
  await assert.rejects(() => new Category({ name: "Seeds Caster", slug: "seeds-caster" }).validate(), /not a valid enum value/);
  await assert.rejects(() => new Category({ name: "Groundnut Oils", slug: "groundnut-oils" }).validate(), /not a valid enum value/);
  await assert.rejects(() => new Category({ name: "Groundnut Oil", slug: "coconut-oil" }).validate(), /canonical/);
});

test("canonical categories can update editable fields in document validation context", async (t) => {
  const originalFindById = Category.findById;
  t.after(() => { Category.findById = originalFindById; });
  const category = new Category({ name: "Groundnut Oil", slug: "groundnut-oil", description: "Old", isActive: true });
  category.save = async function saveForTest() { await this.validate(); return this; };
  Category.findById = async () => category;

  const updated = await updateCategory(category._id, { ...category.toObject(), description: "Updated", image: "", isActive: false, productCount: 4 });
  assert.equal(updated.name, "Groundnut Oil");
  assert.equal(updated.slug, "groundnut-oil");
  assert.equal(updated.description, "Updated");
  assert.equal(updated.image, "");
  assert.equal(updated.isActive, false);
  assert.equal(updated.productCount, undefined);
});
