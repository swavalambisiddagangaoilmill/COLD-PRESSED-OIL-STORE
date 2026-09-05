import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Category from "../models/Category.js";

const apply = process.argv.includes("--apply");

try {
  await connectDB();
  if (Category.collection.collectionName !== "categories") throw new Error("Unexpected category collection; refusing migration.");
  const filter = { image: { $exists: true } };
  const matched = await Category.collection.countDocuments(filter);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", collection: "categories", field: "image", matched }));
  if (apply && matched) {
    const result = await Category.collection.updateMany(filter, { $unset: { image: "" } });
    const remaining = await Category.collection.countDocuments(filter);
    console.log(JSON.stringify({ modified: result.modifiedCount, remaining, verified: remaining === 0 }));
    if (remaining !== 0) process.exitCode = 1;
  }
} catch (error) {
  console.error(`Category image migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
