import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Offer from "../models/Offer.js";

await connectDB();
try {
  const indexes = await Offer.collection.indexes();
  const invalid = indexes.find((index) => index.name === "categories_1_products_1" && index.key?.categories === 1 && index.key?.products === 1);
  await Promise.all([
    Offer.collection.createIndex({ categories: 1 }, { name: "categories_1" }),
    Offer.collection.createIndex({ products: 1 }, { name: "products_1" }),
    Offer.collection.createIndex({ "variants.product": 1, "variants.variant": 1 }, { name: "variants.product_1_variants.variant_1" }),
  ]);
  if (invalid) await Offer.collection.dropIndex(invalid.name);
  console.log(JSON.stringify({ replacedInvalidParallelArrayIndex: Boolean(invalid), indexes: (await Offer.collection.indexes()).map((index) => index.name) }, null, 2));
} finally {
  await mongoose.disconnect();
}
