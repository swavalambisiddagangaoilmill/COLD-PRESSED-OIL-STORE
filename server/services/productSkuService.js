import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { packageDimensionsForSize, packedWeightForSize } from "../utils/shippingDefaults.js";

function skuPart(value, fallback) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return clean || fallback;
}

export async function generateProductSku(data) {
  const category = await Category.findById(data.category).select("name slug").lean();
  if (!category) throw new ApiError("Select a valid product category.", 400);

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
      const skuCollision = error?.code === 11000 && (error?.keyPattern?.sku || error?.keyValue?.sku);
      if (!skuCollision || attempt === 4) throw error;
    }
  }
  throw new ApiError("Unable to generate a unique product SKU.", 409);
}
