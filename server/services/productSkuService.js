import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { packageDimensionsForSize, packedWeightForSize } from "../utils/shippingDefaults.js";
import { isCanonicalProductCategory } from "../../shared/productCategories.js";

function skuPart(value, fallback) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return clean || fallback;
}

function isDuplicateKey(error, field) {
  return error?.code === 11000 && (
    Object.hasOwn(error.keyPattern || {}, field) ||
    Object.hasOwn(error.keyValue || {}, field)
  );
}

function comparableImage(image = {}) {
  return { url: image.url || "", publicId: image.publicId || "" };
}

function comparableVariant(variant = {}) {
  return {
    size: String(variant.size || "").trim(),
    price: Number(variant.price),
    mrp: Number(variant.mrp),
    stock: Number(variant.stock),
    images: (variant.images || []).map(comparableImage),
  };
}

function isSameCreateRequest(existing, payload) {
  const textArray = (values = []) => values.map((value) => String(value).trim());
  const booleanFields = ["featured", "bestSeller", "newArrival", "codEnabled", "onlinePaymentEnabled", "returnEligible", "exchangeEligible", "isActive"];
  const requested = {
    title: String(payload.title || "").trim(),
    description: String(payload.description || "").trim(),
    benefits: textArray(payload.benefits),
    tags: textArray(payload.tags).map((value) => value.toLowerCase()),
    category: String(payload.category || ""),
    price: Number(payload.price),
    discountPrice: payload.discountPrice == null ? null : Number(payload.discountPrice),
    stock: Number(payload.stock || 0),
    size: String(payload.size || "").trim(),
    images: (payload.images || []).map(comparableImage),
    variants: (payload.variants || []).map(comparableVariant),
    ...Object.fromEntries(booleanFields.map((field) => [field, payload[field] === undefined ? undefined : Boolean(payload[field])])),
  };
  const stored = {
    title: existing.title,
    description: existing.description,
    benefits: textArray(existing.benefits),
    tags: textArray(existing.tags).map((value) => value.toLowerCase()),
    category: String(existing.category || ""),
    price: Number(existing.price),
    discountPrice: existing.discountPrice == null ? null : Number(existing.discountPrice),
    stock: Number(existing.stock || 0),
    size: existing.size || "",
    images: (existing.images || []).map(comparableImage),
    variants: (existing.variants || []).map(comparableVariant),
    ...Object.fromEntries(booleanFields.map((field) => [field, payload[field] === undefined ? undefined : Boolean(existing[field])])),
  };
  return JSON.stringify(requested) === JSON.stringify(stored);
}

export async function generateProductSku(data) {
  const category = await Category.findById(data.category).select("name slug").lean();
  if (!category || !isCanonicalProductCategory(category.name, category.slug)) throw new ApiError("Select one of the 16 valid product categories.", 400, [{ field: "category", message: "Product category is not valid." }]);

  const weight = Number(data.weight);
  const base = [
    skuPart(category.slug || category.name, "CAT").slice(0, 8),
    skuPart(data.title, "PRODUCT").slice(0, 12),
    Number.isFinite(weight) && weight > 0 ? skuPart(weight, "UNIT") : "UNIT",
  ].join("-");

  let sku = base;
  let suffix = 1;
  while (await Product.exists({ sku })) {
    suffix += 1;
    sku = `${base}-${suffix}`;
  }
  return sku;
}

export async function generateVariantSku(productSku, size, reserved = new Set()) {
  const base = `${productSku}-${skuPart(size, "VARIANT").slice(0, 12)}`;
  let sku = base;
  let suffix = 1;
  while (reserved.has(sku) || await Product.exists({ "variants.sku": sku })) {
    suffix += 1;
    sku = `${base}-${suffix}`;
  }
  return sku;
}

export async function prepareProductVariants(variants, productSku, existingVariants = []) {
  if (!Array.isArray(variants)) return variants;
  const existingById = new Map(existingVariants.map((variant) => [String(variant._id), variant]));
  const reserved = new Set(existingVariants.map((variant) => variant.sku).filter(Boolean));
  const prepared = [];

  for (const submitted of variants) {
    const variant = { ...submitted };
    const existing = variant._id ? existingById.get(String(variant._id)) : null;
    delete variant.sku;
    delete variant.shippingWeight;
    delete variant.dimensions;
    variant.sku = existing?.sku || await generateVariantSku(productSku, variant.size, reserved);
    variant.shippingWeight = existing?.shippingWeight || packedWeightForSize(variant.size);
    variant.dimensions = existing?.dimensions || packageDimensionsForSize(variant.size);
    reserved.add(variant.sku);
    prepared.push(variant);
  }
  return prepared;
}

export async function createProductWithGeneratedSku(payload) {
  const data = { ...payload };
  delete data.sku;
  delete data.weight;
  delete data.dimensions;
  if (data.size) {
    data.weight = packedWeightForSize(data.size);
    data.dimensions = packageDimensionsForSize(data.size);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    data.sku = await generateProductSku(data);
    data.variants = await prepareProductVariants(payload.variants, data.sku);
    try {
      return await Product.create(data);
    } catch (error) {
      if (isDuplicateKey(error, "slug")) {
        const existing = await Product.findOne({ slug: data.slug });
        if (existing && isSameCreateRequest(existing, payload)) return existing;
        throw new ApiError("A product with this title already exists.", 409, [{ field: "title", message: "Product title already exists." }]);
      }
      const skuCollision = isDuplicateKey(error, "sku") || isDuplicateKey(error, "variants.sku");
      if (!skuCollision) throw error;
      if (attempt === 4) {
        const field = isDuplicateKey(error, "variants.sku") ? "variants.sku" : "sku";
        throw new ApiError("A product with this SKU already exists. Please retry.", 409, [{ field, message: "SKU already exists." }]);
      }
    }
  }
  throw new ApiError("Unable to generate a unique product SKU.", 409);
}
