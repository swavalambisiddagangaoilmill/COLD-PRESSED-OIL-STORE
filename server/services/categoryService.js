// Category business logic.
import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { slugify } from "../utils/slugify.js";
import Product from "../models/Product.js";
import Offer from "../models/Offer.js";
import Coupon from "../models/Coupon.js";
import SiteContent from "../models/SiteContent.js";
import mongoose from "mongoose";

const safeCategoryFields = "-image -imageUrl -image_url -categoryImage -categoryImageUrl -thumbnail";
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const duplicateCategory = () => new ApiError("A category with this name already exists.", 409, [{ field: "name", message: "Category name already exists." }]);

export async function requireProductCategory(id) {
  const category = await Category.findById(id).select("name slug isActive");
  if (!category || category.isActive === false) throw new ApiError("Select an active product category.", 400, [{ field: "category", message: "Product category is not available." }]);
  return category;
}

export async function listCategories() {
  return Category.find({ isActive: true }).select(safeCategoryFields).sort({ name: 1 });
}

export async function listAdminCategories() {
  const categories = await Category.aggregate([{ $lookup: { from: "products", localField: "_id", foreignField: "category", as: "assignedProducts" } }, { $addFields: { productCount: { $size: "$assignedProducts" } } }, { $project: { assignedProducts: 0, image: 0, imageUrl: 0, image_url: 0, categoryImage: 0, categoryImageUrl: 0, thumbnail: 0 } }]);
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCategory(idOrSlug) {
  const query = /^[0-9a-fA-F]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const category = await Category.findOne(query).select(safeCategoryFields);
  if (!category) throw new ApiError("Category not found.", 404);
  return category;
}

export async function createCategory(payload) {
  const name = String(payload.name || "").trim();
  const slug = slugify(name);
  if (!slug) throw new ApiError("Category name must contain letters or numbers.", 400, [{ field: "name", message: "Enter a valid category name." }]);
  const exists = await Category.exists({ $or: [{ name: new RegExp(`^${escapeRegex(name)}$`, "i") }, { slug }] });
  if (exists) throw duplicateCategory();
  try {
    return await Category.create({ name, slug, description: payload.description, isActive: payload.isActive !== false });
  } catch (error) {
    if (error?.code === 11000) throw duplicateCategory();
    throw error;
  }
}

export async function updateCategory(id, payload) {
  const current = await Category.findById(id);
  if (!current) throw new ApiError("Category not found.", 404);
  const name = String(payload.name || current.name).trim();
  if (name !== current.name) {
    const slug = slugify(name);
    if (!slug) throw new ApiError("Category name must contain letters or numbers.", 400, [{ field: "name", message: "Enter a valid category name." }]);
    const exists = await Category.exists({ _id: { $ne: current._id }, $or: [{ name: new RegExp(`^${escapeRegex(name)}$`, "i") }, { slug }] });
    if (exists) throw duplicateCategory();
    current.name = name;
    current.slug = slug;
  }
  if (payload.description !== undefined) current.description = payload.description;
  if (payload.isActive !== undefined) current.isActive = payload.isActive === true || payload.isActive === "true";
  try { return await current.save(); }
  catch (error) {
    if (error?.code === 11000) throw duplicateCategory();
    throw error;
  }
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
