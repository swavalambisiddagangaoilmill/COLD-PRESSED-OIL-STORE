// Product category model.
import mongoose from "mongoose";
import { PRODUCT_CATEGORIES, isCanonicalProductCategory } from "../../shared/productCategories.js";

const canonicalName = (value) => PRODUCT_CATEGORIES.includes(value);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, validate: { validator(value) { return canonicalName(value) || (!this.isNew && !this.isModified("name")); }, message: "Category must be one of the 14 canonical categories." } },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, validate: { validator(value) { return isCanonicalProductCategory(this.name, value) || (!this.isNew && !this.isModified("name") && !this.isModified("slug")); }, message: "Category slug is not canonical for its name." } },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);


