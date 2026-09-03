// Product catalog business logic.
import mongoose from "mongoose";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { slugify } from "../utils/slugify.js";
import { createProductWithGeneratedSku, prepareProductVariants } from "./productSkuService.js";

function normalizeSearch(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBaseMatch(query) {
  const filter = { isActive: true };
  if (query.category && mongoose.Types.ObjectId.isValid(query.category)) filter.category = new mongoose.Types.ObjectId(query.category);
  if (query.featured) filter.featured = query.featured === "true";
  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
  }
  return filter;
}

function buildKeywordMatch(search) {
  const tokens = normalizeSearch(search).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  return {
    $and: tokens.map((token) => {
      const regex = new RegExp(escapeRegex(token), "i");
      return {
        $or: [
          { title: regex },
          { description: regex },
          { tags: regex },
          { sku: regex },
          { slug: regex },
          { "categoryDoc.name": regex },
          { "categoryDoc.slug": regex },
        ],
      };
    }),
  };
}

function regexScore(input, regex, score) {
  return { $cond: [{ $regexMatch: { input: { $ifNull: [input, ""] }, regex, options: "i" } }, score, 0] };
}

function buildSearchRank(search) {
  const normalized = normalizeSearch(search);
  if (!normalized) return 0;
  const exact = `^${escapeRegex(normalized)}$`;
  const prefix = `^${escapeRegex(normalized)}`;
  const contains = escapeRegex(normalized);
  return {
    $max: [
      regexScore("$title", exact, 100),
      regexScore("$title", prefix, 80),
      regexScore("$title", contains, 60),
      regexScore("$categoryDoc.name", contains, 45),
      {
        $cond: [
          {
            $anyElementTrue: {
              $map: {
                input: { $ifNull: ["$tags", []] },
                as: "tag",
                in: { $regexMatch: { input: "$$tag", regex: contains, options: "i" } },
              },
            },
          },
          35,
          0,
        ],
      },
      regexScore("$description", contains, 20),
      regexScore("$sku", contains, 10),
      regexScore("$slug", contains, 10),
    ],
  };
}

function buildSort(sort = "newest") {
  const sortMap = {
    newest: { createdAt: -1 },
    priceAsc: { price: 1 },
    priceDesc: { price: -1 },
    featured: { featured: -1, createdAt: -1 },
  };
  return sortMap[sort] || sortMap.newest;
}

export async function listProducts(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 100);
  const includeAll = query.all === true || query.all === "true";
  const search = normalizeSearch(query.search);
  const pipeline = [
    { $match: buildBaseMatch(query) },
    { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "categoryDoc" } },
    { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
  ];
  const keywordMatch = buildKeywordMatch(search);
  if (keywordMatch) pipeline.push({ $match: keywordMatch }, { $addFields: { searchRank: buildSearchRank(search) } });
  const itemPipeline = [
    ...(includeAll ? [] : [{ $skip: (page - 1) * limit }, { $limit: limit }]),
    { $addFields: { category: { _id: "$categoryDoc._id", name: "$categoryDoc.name", slug: "$categoryDoc.slug" } } },
    { $project: { categoryDoc: 0, searchRank: 0 } },
  ];
  pipeline.push(
    { $sort: keywordMatch ? { searchRank: -1, ...buildSort(query.sort) } : buildSort(query.sort) },
    {
      $facet: {
        items: itemPipeline,
        total: [{ $count: "count" }],
      },
    }
  );
  const [result] = await Product.aggregate(pipeline);
  const items = result?.items || [];
  const total = result?.total?.[0]?.count || 0;
  return { items, pagination: { page: includeAll ? 1 : page, limit: includeAll ? total : limit, total, pages: includeAll ? (total ? 1 : 0) : Math.ceil(total / limit) } };
}

export async function getFeaturedProducts() {
  return Product.find({ featured: true, isActive: true }).populate("category", "name slug").sort({ createdAt: -1 }).limit(12);
}

export async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, isActive: true }).populate("category", "name slug");
  if (!product) throw new ApiError("Product not found.", 404);
  return product;
}

export async function getProductsByCategory(categoryId, query) {
  return listProducts({ ...query, category: categoryId });
}

export async function getRelatedProducts(productId, limit = 6) {
  const current = await Product.findById(productId);
  if (!current) throw new ApiError("Product not found.", 404);
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 4), 8);
  const sameCategory = await Product.find({ _id: { $ne: current._id }, category: current.category, isActive: true })
    .populate("category", "name slug")
    .limit(safeLimit);
  if (sameCategory.length >= safeLimit) return sameCategory;
  const fallback = await Product.find({ _id: { $ne: current._id }, category: { $ne: current.category }, isActive: true })
    .populate("category", "name slug")
    .limit(safeLimit - sameCategory.length);
  return [...sameCategory, ...fallback];
}

export async function createProduct(payload) {
  const slug = payload.slug || slugify(payload.title);
  return createProductWithGeneratedSku({ ...payload, slug });
}

export async function updateProduct(id, payload) {
  const updates = payload.title && !payload.slug ? { ...payload, slug: slugify(payload.title) } : { ...payload };
  delete updates.sku;
  delete updates.weight;
  delete updates.dimensions;
  if (Array.isArray(updates.variants)) {
    const current = await Product.findById(id).select("sku variants");
    if (!current) throw new ApiError("Product not found.", 404);
    updates.variants = await prepareProductVariants(updates.variants, current.sku, current.variants || []);
  }
  const product = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!product) throw new ApiError("Product not found.", 404);
  return product;
}

export async function deleteProduct(id) {
  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!product) throw new ApiError("Product not found.", 404);
  await User.updateMany({ $or: [{ wishlist: product._id }, { "cart.product": product._id }] }, { $pull: { wishlist: product._id, cart: { product: product._id } } });
  return product;
}

