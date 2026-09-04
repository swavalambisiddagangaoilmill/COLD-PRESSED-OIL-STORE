import mongoose from "mongoose";
import { env } from "../config/env.js";
import Product from "../models/Product.js";

await mongoose.connect(env.mongoUri);
try {
  const products = await Product.find({}).select("title stock variants").lean();
  const review = [];
  for (const product of products) {
    for (const variant of product.variants || []) {
      const missing = [];
      if (!variant.size) missing.push("variant name");
      if (!variant.sku) missing.push("SKU");
      if (!(Number(variant.price) > 0)) missing.push("price");
      if (!(Number(variant.shippingWeight) > 0)) missing.push("weight (kg)");
      if (!(Number(variant.dimensions?.length) > 0)) missing.push("length (cm)");
      if (!(Number(variant.dimensions?.width) > 0)) missing.push("width (cm)");
      if (!(Number(variant.dimensions?.height) > 0)) missing.push("height (cm)");
      if (!variant.images?.length) missing.push("images");
      if (missing.length) review.push({ productId: String(product._id), product: product.title, variantId: String(variant._id), variant: variant.size || "Unnamed", missing });
    }
    if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < 0) review.push({ productId: String(product._id), product: product.title, missing: ["valid total product stock in liters"] });
  }
  console.log(JSON.stringify({ productsChecked: products.length, variantsRequiringManualReview: review.length, review }, null, 2));
  if (review.length) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
