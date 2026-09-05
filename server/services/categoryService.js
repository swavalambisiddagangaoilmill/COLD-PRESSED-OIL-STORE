// Category business logic.
import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_SLUGS, isCanonicalProductCategory } from "../../shared/productCategories.js";
import Product from "../models/Product.js";
import Offer from "../models/Offer.js";
import Coupon from "../models/Coupon.js";
import SiteContent from "../models/SiteContent.js";
import mongoose from "mongoose";

const categoryOrder = Object.fromEntries(PRODUCT_CATEGORIES.map((name, index) => [name, index]));

export async function requireCanonicalCategory(id) {
  const category = await Category.findById(id).select("name slug");
  if (!category || !isCanonicalProductCategory(category.name, category.slug)) throw new ApiError("Select one of the 14 valid product categories.", 400, [{ field: "category", message: "Product category is not valid." }]);
  return category;
}

export async function listCategories() {
  const categories = await Category.find({ name: { $in: PRODUCT_CATEGORIES }, isActive: true }).select("-image -imageUrl -image_url -categoryImage -categoryImageUrl -thumbnail");
  return categories.sort((a, b) => categoryOrder[a.name] - categoryOrder[b.name]);
}

export async function listAdminCategories() {
  const categories = await Category.aggregate([{ $lookup: { from: "products", localField: "_id", foreignField: "category", as: "assignedProducts" } }, { $addFields: { productCount: { $size: "$assignedProducts" } } }, { $project: { assignedProducts: 0, image: 0, imageUrl: 0, image_url: 0, categoryImage: 0, categoryImageUrl: 0, thumbnail: 0 } }]);
  return categories.sort((a, b) => (categoryOrder[a.name] ?? Number.MAX_SAFE_INTEGER) - (categoryOrder[b.name] ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
}

export async function getCategory(idOrSlug) {
  const query = /^[0-9a-fA-F]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const category = await Category.findOne(query).select("-image -imageUrl -image_url -categoryImage -categoryImageUrl -thumbnail");
  if (!category || !isCanonicalProductCategory(category.name, category.slug)) throw new ApiError("Category not found.", 404);
  return category;
}

export function createCategory(payload) {
  const canonical = PRODUCT_CATEGORY_SLUGS.find(({ name }) => name === payload.name);
  if (!canonical) throw new ApiError("Category name must be one of the 14 canonical categories.", 400, [{ field: "name", message: "Category name is not valid." }]);
  if (payload.slug && payload.slug !== canonical.slug) throw new ApiError("Category slug must match its canonical name.", 400, [{ field: "slug", message: `Use ${canonical.slug}.` }]);
  return Category.create({ name: canonical.name, slug: canonical.slug, description: payload.description, isActive: payload.isActive !== false });
}

export async function updateCategory(id, payload) {
  const current = await Category.findById(id);
  if (!current) throw new ApiError("Category not found.", 404);
  const name = String(payload.name || current.name).trim();
  const canonical = PRODUCT_CATEGORY_SLUGS.find((item) => item.name === name);
  const preservingLegacyName = !canonical && name === current.name && !isCanonicalProductCategory(current.name, current.slug);
  if (!canonical && !preservingLegacyName) throw new ApiError("Category must be one of the 14 canonical categories.", 400, [{ field: "name", message: "Select a valid category name." }]);
  if (canonical) {
    if (payload.slug && payload.slug !== canonical.slug) throw new ApiError("Category slug must match its canonical name.", 400, [{ field: "slug", message: `Use ${canonical.slug}.` }]);
    current.name = canonical.name;
    current.slug = canonical.slug;
  }
  if (payload.description !== undefined) current.description = payload.description;
  if (payload.isActive !== undefined) current.isActive = payload.isActive === true || payload.isActive === "true";
  return current.save();
}

export async function deleteCategory(id) {
  const session = await mongoose.startSession();
  try {
    let deleted;
    await session.withTransaction(async () => {
      const category = await Category.findById(id).session(session);
      if (!category) throw new ApiError("Category no longer exists.", 404);
      const [products, offers, coupons, navigation] = await Promise.all([
        Product.countDocuments({ category: category._id }).session(session),
        Offer.countDocuments({ $or: [{ category: category._id }, { categories: category._id }] }).session(session),
        Coupon.countDocuments({ categories: category._id }).session(session),
        SiteContent.countDocuments({ key: "navbar", "value.items.children": { $elemMatch: { type: "CATEGORY", referenceId: String(category._id) } } }).session(session),
      ]);
      if (products) throw new ApiError("Cannot delete this category because products are assigned to it. Reassign those products first.", 409);
      if (offers || coupons || navigation) throw new ApiError("Cannot delete this category because other business configuration still references it.", 409);
      const result = await Category.deleteOne({ _id: category._id }, { session });
      if (result.deletedCount !== 1) throw new ApiError("Unable to delete category. Please try again.", 409);
      deleted = category;
    });
    return deleted;
  } finally { await session.endSession(); }
}
