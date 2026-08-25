// Product catalog business logic.
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { slugify } from "../utils/slugify.js";

function normalizeSearch(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBaseMatch(query) {
  const filter = { isActive: true };
  if (query.featured) filter.featured = query.featured === "true";
  if (query.minPrice || query.maxPrice) {
    filter.variants = { $elemMatch: { isActive: true, isArchived: { $ne: true }, price: {} } };
    if (query.minPrice) filter.variants.$elemMatch.price.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.variants.$elemMatch.price.$lte = Number(query.maxPrice);
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
          { "variants.name": regex }, { "variants.sku": regex },
          { slug: regex },
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
      regexScore("$slug", contains, 10),
    ],
  };
}

function buildSort(sort = "newest") {
  const sortMap = {
    newest: { createdAt: -1 },
    priceAsc: { minimumVariantPrice: 1 },
    priceDesc: { minimumVariantPrice: -1 },
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
    { $addFields: { minimumVariantPrice: { $min: { $map: { input: { $filter: { input: "$variants", as: "variant", cond: { $and: ["$$variant.isActive", { $ne: ["$$variant.isArchived", true] }] } } }, as: "variant", in: "$$variant.price" } } } } },
  ];
  const keywordMatch = buildKeywordMatch(search);
  if (keywordMatch) pipeline.push({ $match: keywordMatch }, { $addFields: { searchRank: buildSearchRank(search) } });
  const itemPipeline = [
    ...(includeAll ? [] : [{ $skip: (page - 1) * limit }, { $limit: limit }]),
    { $project: { searchRank: 0, minimumVariantPrice: 0 } },
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
  return Product.find({ featured: true, isActive: true }).sort({ createdAt: -1 }).limit(12);
}

export async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  return product;
}

export async function getProductsByCategory(categoryId, query) {
  return listProducts(query);
}

export async function getRelatedProducts(productId, limit = 6) {
  const current = await Product.findById(productId);
  if (!current) throw new ApiError("Product not found.", 404);
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 4), 8);
  return Product.find({ _id: { $ne: current._id }, isActive: true }).limit(safeLimit);
}

export async function createProduct(payload) {
  const slug = payload.slug || slugify(payload.title);
  const variants = (payload.variants || []).map((variant) => ({ ...variant, discount: Math.max(0, Number(variant.mrp) - Number(variant.price)) }));
  return Product.create({ ...payload, variants, slug });
}

export async function updateProduct(id, payload) {
  const current = await Product.findById(id);
  if (!current) throw new ApiError("Product not found.", 404);
  const incomingIds = new Set((payload.variants || []).map((variant) => String(variant._id || "")).filter(Boolean));
  const archived = payload.variants ? current.variants.filter((variant) => !incomingIds.has(String(variant._id))).map((variant) => ({ ...variant.toObject(), isActive: false, isArchived: true })) : [];
  const normalized = payload.variants ? { ...payload, variants: [...payload.variants.map((variant) => ({ ...variant, discount: Math.max(0, Number(variant.mrp) - Number(variant.price)) })), ...archived] } : payload;
  const updates = normalized.title && !normalized.slug ? { ...normalized, slug: slugify(normalized.title) } : normalized;
  current.set(updates);
  await current.save();
  return current;
}

export async function deleteProduct(id) {
  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!product) throw new ApiError("Product not found.", 404);
  return product;
}

