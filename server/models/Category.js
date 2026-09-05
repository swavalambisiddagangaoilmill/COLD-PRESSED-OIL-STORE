// Product category model.
import mongoose from "mongoose";
import { PRODUCT_CATEGORIES, isCanonicalProductCategory } from "../../shared/productCategories.js";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, enum: PRODUCT_CATEGORIES },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, validate: { validator(value) { return isCanonicalProductCategory(this.name, value); }, message: "Category slug is not canonical for its name." } },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);


