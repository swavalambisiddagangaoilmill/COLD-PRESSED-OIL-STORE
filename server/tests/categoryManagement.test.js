import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import mongoose from "mongoose";
import Category from "../models/Category.js";
import Coupon from "../models/Coupon.js";
import Offer from "../models/Offer.js";
import Product from "../models/Product.js";
import SiteContent from "../models/SiteContent.js";
import { deleteCategory } from "../services/categoryService.js";

const query = (value) => ({ session() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const mockTransaction = () => mock.method(mongoose, "startSession", async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} }));
const mockDependencies = ({ products = 0, offers = 0, coupons = 0, navigation = 0 } = {}) => {
  mock.method(Product, "countDocuments", () => query(products)); mock.method(Offer, "countDocuments", () => query(offers)); mock.method(Coupon, "countDocuments", () => query(coupons)); mock.method(SiteContent, "countDocuments", () => query(navigation));
};

test("category schema and admin UI contain no category image feature", async () => {
  const category = new Category({ name: "Coconut Oil", slug: "coconut-oil", description: "Pure oil", isActive: true, image: "https://example.com/old.jpg" });
  assert.equal(category.image, undefined);
  const [model, validator, admin, seed] = await Promise.all([readFile(new URL("../models/Category.js", import.meta.url), "utf8"), readFile(new URL("../validators/categoryValidators.js", import.meta.url), "utf8"), readFile(new URL("../../src/admin/pages/AdminPages.jsx", import.meta.url), "utf8"), readFile(new URL("../seed/seed.js", import.meta.url), "utf8")]);
  assert.doesNotMatch(model, /\bimage\s*:/); assert.doesNotMatch(validator, /body\("image"\)/);
  const categorySection = admin.slice(admin.indexOf("function CategoryForm"), admin.indexOf("function OfferForm"));
  assert.doesNotMatch(categorySection, /Upload Image|accept="image|form\.image|category:image|c\.image/);
  assert.doesNotMatch(seed.slice(seed.indexOf("ensureCategory"), seed.indexOf("ensureProduct")), /image/);
});

test("safe category deletion removes only an unreferenced category", async () => {
  const category = new Category({ name: "Coconut Oil", slug: "coconut-oil" }); let productDeletes = 0;
  mockTransaction(); mock.method(Category, "findById", () => query(category)); mockDependencies(); mock.method(Category, "deleteOne", () => Promise.resolve({ deletedCount: 1 }));
  for (const method of ["deleteOne", "deleteMany", "findByIdAndDelete"]) if (typeof Product[method] === "function") mock.method(Product, method, () => { productDeletes += 1; });
  try { const deleted = await deleteCategory(category._id); assert.equal(deleted.name, "Coconut Oil"); assert.equal(productDeletes, 0); } finally { mock.restoreAll(); }
});

test("product dependency blocks deletion without modifying category or product", async () => {
  const category = new Category({ name: "Groundnut Oil", slug: "groundnut-oil" }); let categoryDeletes = 0; let productDeletes = 0;
  mockTransaction(); mock.method(Category, "findById", () => query(category)); mockDependencies({ products: 2 }); mock.method(Category, "deleteOne", () => { categoryDeletes += 1; }); mock.method(Product, "deleteMany", () => { productDeletes += 1; });
  try { await assert.rejects(deleteCategory(category._id), /products are assigned/); assert.equal(categoryDeletes, 0); assert.equal(productDeletes, 0); } finally { mock.restoreAll(); }
});

test("offer, coupon, and navbar references also protect categories", async () => {
  for (const dependencies of [{ offers: 1 }, { coupons: 1 }, { navigation: 1 }]) {
    const category = new Category({ name: "Neem Oil", slug: "neem-oil" }); let deleted = false;
    mockTransaction(); mock.method(Category, "findById", () => query(category)); mockDependencies(dependencies); mock.method(Category, "deleteOne", () => { deleted = true; });
    try { await assert.rejects(deleteCategory(category._id), /business configuration/); assert.equal(deleted, false); } finally { mock.restoreAll(); }
  }
});

test("missing and repeated category deletion is handled safely", async () => {
  mockTransaction(); mock.method(Category, "findById", () => query(null));
  try { await assert.rejects(deleteCategory(new mongoose.Types.ObjectId()), /no longer exists/); } finally { mock.restoreAll(); }
});

test("migration is dry-run by default, category-only, field-only, and idempotent", async () => {
  const source = await readFile(new URL("../scripts/remove-category-images.js", import.meta.url), "utf8");
  assert.match(source, /collectionName !== "categories"/); assert.match(source, /image: \{ \$exists: true \}/); assert.match(source, /\$unset: \{ image: "" \}/); assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.doesNotMatch(source, /deleteMany|dropIndex|dropDatabase/);
});

test("delete API is owner-only, audited, and uses a custom confirmation modal", async () => {
  const [routes, controller, admin] = await Promise.all([readFile(new URL("../admin/routes/adminApiRoutes.js", import.meta.url), "utf8"), readFile(new URL("../admin/controllers/adminController.js", import.meta.url), "utf8"), readFile(new URL("../../src/admin/pages/AdminPages.jsx", import.meta.url), "utf8")]);
  assert.match(routes, /delete\("\/categories\/:id", requireAdminPermission\("categories\.delete"\)/);
  assert.match(controller, /action: "CATEGORY_DELETE"/); assert.match(admin, /title="Delete Category\?"/); assert.doesNotMatch(admin.slice(admin.indexOf("export function CategoriesPage"), admin.indexOf("function OfferForm")), /window\.confirm|window\.alert/);
});
