import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import mongoose from "mongoose";
import Category from "../models/Category.js";
import { createCategory, updateCategory } from "../services/categoryService.js";

test("category schema accepts database-driven names without a fixed enum", async () => {
  for (const name of ["Coconut Oil", "Sesame/Gingelly Oil", "Roasted Walnut Oil", "Future Seed Oil"]) {
    await new Category({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") }).validate();
  }
  await assert.rejects(() => new Category({ name: "", slug: "empty" }).validate(), /required/i);
  await assert.rejects(() => new Category({ name: "A".repeat(121), slug: "too-long" }).validate(), /maximum allowed length/i);
});

test("live category validation contains no canonical-list restriction", async () => {
  const sources = await Promise.all([
    readFile(new URL("../models/Category.js", import.meta.url), "utf8"),
    readFile(new URL("../services/categoryService.js", import.meta.url), "utf8"),
    readFile(new URL("../validators/categoryValidators.js", import.meta.url), "utf8"),
    readFile(new URL("../services/productSkuService.js", import.meta.url), "utf8"),
  ]);
  for (const source of sources) assert.doesNotMatch(source, /PRODUCT_CATEGORIES|isCanonicalProductCategory|14 canonical|one of the 14/);
});

test("arbitrary categories can be created and edited with derived slugs", async () => {
  const id = new mongoose.Types.ObjectId();
  const category = Category.hydrate({ _id: id, name: "Future Seed Oil", slug: "future-seed-oil", isActive: true });
  category.save = async function saveForTest() { await this.validate(); return this; };
  mock.method(Category, "exists", async () => false);
  mock.method(Category, "create", async (value) => value);
  mock.method(Category, "findById", async () => category);
  try {
    const created = await createCategory({ name: "Pecan Oil", description: "New" });
    assert.equal(created.slug, "pecan-oil");
    const updated = await updateCategory(id, { name: "Roasted Pecan Oil", isActive: false });
    assert.equal(updated.name, "Roasted Pecan Oil");
    assert.equal(updated.slug, "roasted-pecan-oil");
    assert.equal(updated.isActive, false);
  } finally { mock.restoreAll(); }
});
