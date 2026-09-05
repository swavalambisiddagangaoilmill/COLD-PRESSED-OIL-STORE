// Category business logic.
import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_SLUGS, isCanonicalProductCategory } from "../../shared/productCategories.js";

const categoryOrder = Object.fromEntries(PRODUCT_CATEGORIES.map((name, index) => [name, index]));

export async function requireCanonicalCategory(id) {
  const category = await Category.findById(id).select("name slug");
  if (!category || !isCanonicalProductCategory(category.name, category.slug)) throw new ApiError("Select one of the 14 valid product categories.", 400, [{ field: "category", message: "Product category is not valid." }]);
  return category;
}

export async function listCategories() {
  const categories = await Category.find({ name: { $in: PRODUCT_CATEGORIES }, isActive: true });
  return categories.sort((a, b) => categoryOrder[a.name] - categoryOrder[b.name]);
}

export async function getCategory(idOrSlug) {
  const query = /^[0-9a-fA-F]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const category = await Category.findOne(query);
  if (!category || !isCanonicalProductCategory(category.name, category.slug)) throw new ApiError("Category not found.", 404);
  return category;
}

export function createCategory(payload) {
  const canonical = PRODUCT_CATEGORY_SLUGS.find(({ name }) => name === payload.name);
  if (!canonical) throw new ApiError("Category name must be one of the 14 canonical categories.", 400, [{ field: "name", message: "Category name is not valid." }]);
  if (payload.slug && payload.slug !== canonical.slug) throw new ApiError("Category slug must match its canonical name.", 400, [{ field: "slug", message: `Use ${canonical.slug}.` }]);
  return Category.create({ ...payload, name: canonical.name, slug: canonical.slug, isActive: true });
}

export async function updateCategory(id, payload) {
  const current = await Category.findById(id);
  if (!current) throw new ApiError("Category not found.", 404);
  const name = payload.name || current.name;
  const canonical = PRODUCT_CATEGORY_SLUGS.find((item) => item.name === name);
  if (!canonical) throw new ApiError("Category name must be one of the 14 canonical categories.", 400, [{ field: "name", message: "Category name is not valid." }]);
  if (payload.slug && payload.slug !== canonical.slug) throw new ApiError("Category slug must match its canonical name.", 400, [{ field: "slug", message: `Use ${canonical.slug}.` }]);
  current.name = canonical.name;
  current.slug = canonical.slug;
  if (payload.description !== undefined) current.description = payload.description;
  if (payload.image !== undefined) current.image = payload.image;
  if (payload.isActive !== undefined) current.isActive = Boolean(payload.isActive);
  return current.save();
}

export async function deleteCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw new ApiError("Category not found.", 404);
  throw new ApiError("Canonical product categories cannot be deleted.", 409);
}
