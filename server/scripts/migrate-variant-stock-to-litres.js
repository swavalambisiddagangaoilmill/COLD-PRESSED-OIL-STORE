import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Product from "../models/Product.js";
import { sizeInLitres } from "../utils/shippingDefaults.js";

const apply = process.argv.includes("--apply");
const confirmedContainerUnits = process.argv.includes("--confirmed-container-units");
if (apply && !confirmedContainerUnits) throw new Error("Refusing to convert ambiguous stock. Re-run only after confirming legacy values are container counts with --confirmed-container-units.");
await connectDB();

try {
  const products = await Product.collection.find({ "variants.0": { $exists: true } }).toArray();
  const operations = [];
  const review = [];
  for (const product of products) {
    const variants = [];
    let valid = true;
    for (const variant of product.variants || []) {
      try {
        const litres = sizeInLitres(variant.size);
        variants.push({ ...variant, litres, stock: Number((Number(variant.stock || 0) * litres).toFixed(3)), stockUnit: "LITRES" });
      } catch {
        valid = false;
        review.push({ productId: String(product._id), title: product.title, variantId: String(variant._id), size: variant.size });
      }
    }
    if (valid && confirmedContainerUnits) operations.push({ updateOne: { filter: { _id: product._id, "variants.stockUnit": { $ne: "LITRES" } }, update: { $set: { variants, stock: variants.reduce((sum, variant) => sum + variant.stock, 0) } } } });
    else if (valid) review.push({ productId: String(product._id), title: product.title, reason: "Confirm whether existing variant stock values are container counts or litres before conversion.", variants: (product.variants || []).map((variant) => ({ variantId: String(variant._id), size: variant.size, stock: variant.stock })) });
  }
  const result = apply && operations.length ? await Product.bulkWrite(operations) : null;
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", productsWithVariants: products.length, eligible: operations.length, modified: result?.modifiedCount || 0, manualReview: review }, null, 2));
} finally {
  await mongoose.disconnect();
}
