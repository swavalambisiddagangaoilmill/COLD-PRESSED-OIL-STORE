import "dotenv/config";
import mongoose from "mongoose";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { PRODUCT_CATEGORY_SLUGS } from "../../shared/productCategories.js";

const apply = process.argv.includes("--apply");
const exactTitlePatterns = [
  ["Flax Seed Oil", /\bflax\s*seed oil\b/i],
  ["Safflower Oil", /\bsafflower oil\b/i],
  ["Sunflower Oil", /\bsunflower oil\b/i],
  ["Coconut Oil", /\bcoconut oil\b/i],
  ["Castor Oil", /\bcastor oil\b/i],
  ["Badam Oil", /\bbadam oil\b/i],
  ["White Sesame Oil", /\bwhite sesame oil\b/i],
  ["Black Sesame Oil", /\bblack sesame oil\b/i],
  ["Niger Seed Oil", /\bniger(?: seed)? oil\b/i],
  ["Mustard Oil", /\bmustard oil\b/i],
  ["Groundnut Oil", /\bgroundnut oil\b/i],
  ["Neem Oil", /\bneem oil\b/i],
  ["Herbal Oil", /\bherbal oil\b/i],
  ["Caranja Oil", /\bcaranja oil\b/i],
];

function categoryFor(product) {
  if (product.category?.name === "Groundnut Oils") return "Groundnut Oil";
  return exactTitlePatterns.find(([, pattern]) => pattern.test(product.title))?.[0];
}

await mongoose.connect(process.env.MONGO_URI);
try {
  const existingCategories = await Category.find();
  const byName = new Map(existingCategories.map((category) => [category.name, category]));
  const canonical = new Map();

  for (const definition of PRODUCT_CATEGORY_SLUGS) {
    let category = byName.get(definition.name);
    if (!category && definition.name === "Groundnut Oil") category = byName.get("Groundnut Oils");
    if (category) {
      if (apply && (category.name !== definition.name || category.slug !== definition.slug || !category.isActive)) {
        await Category.collection.updateOne({ _id: category._id }, { $set: { name: definition.name, slug: definition.slug, isActive: true } });
      }
    } else if (apply) {
      category = await Category.create({ ...definition, isActive: true });
    } else {
      category = { _id: `new:${definition.slug}`, ...definition };
    }
    canonical.set(definition.name, category);
  }

  const products = await Product.find().populate("category", "name slug");
  const migrated = [];
  const manualReview = [];
  for (const product of products) {
    const targetName = categoryFor(product);
    if (!targetName) {
      if (!PRODUCT_CATEGORY_SLUGS.some(({ name }) => name === product.category?.name)) manualReview.push({ id: String(product._id), title: product.title, category: product.category?.name || null });
      continue;
    }
    const target = canonical.get(targetName);
    if (String(product.category?._id) === String(target._id)) continue;
    if (apply) await Product.updateOne({ _id: product._id }, { $set: { category: target._id } });
    migrated.push({ id: String(product._id), title: product.title, from: product.category?.name || null, to: targetName });
  }

  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", canonicalCategories: PRODUCT_CATEGORY_SLUGS.length, migratedCount: migrated.length, migrated, manualReviewCount: manualReview.length, manualReview }, null, 2));
} finally {
  await mongoose.disconnect();
}
