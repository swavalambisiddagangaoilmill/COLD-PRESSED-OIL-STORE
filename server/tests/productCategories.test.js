import assert from "node:assert/strict";
import { test } from "node:test";
import Category from "../models/Category.js";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_SLUGS, isCanonicalProductCategory } from "../../shared/productCategories.js";

const expected = [
  "Flax Seed Oil", "Safflower Oil", "Sunflower Oil", "Coconut Oil", "Castor Oil", "Badam Oil", "Raw Material Crushing", "White Sesame Oil",
  "Black Sesame Oil", "Niger Seed Oil", "Mustard Oil", "Groundnut Oil", "Neem Oil", "Herbal Oil", "Seeds Caster", "Caranja Oil",
];

test("the category source contains the exact 16 canonical labels in order", () => {
  assert.deepEqual(PRODUCT_CATEGORIES, expected);
  assert.equal(PRODUCT_CATEGORY_SLUGS.length, 16);
});

test("canonical category names and matching slugs validate", async () => {
  for (const category of PRODUCT_CATEGORY_SLUGS) {
    await new Category(category).validate();
    assert.equal(isCanonicalProductCategory(category.name, category.slug), true);
  }
});

test("obsolete and mismatched categories are rejected", async () => {
  await assert.rejects(() => new Category({ name: "Groundnut Oils", slug: "groundnut-oils" }).validate(), /not a valid enum value/);
  await assert.rejects(() => new Category({ name: "Groundnut Oil", slug: "coconut-oil" }).validate(), /canonical/);
});
