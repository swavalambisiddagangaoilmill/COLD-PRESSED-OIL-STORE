// Product catalog model.
import mongoose from "mongoose";

const productImageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: { type: String } },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    price: { type: Number, required: true, min: 0.01 },
    mrp: { type: Number, required: true, min: 0.01 },
    discount: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    weight: { type: Number, min: 0 },
    dimensions: {
      length: { type: Number, min: 0 },
      width: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
    },
    images: [productImageSchema],
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, uppercase: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true },
    benefits: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true, lowercase: true }],
    variants: {
      type: [variantSchema],
      validate: {
        validator: (items) => {
          if (!Array.isArray(items) || !items.some((variant) => variant.isActive && !variant.isArchived)) return false;
          const visible = items.filter((variant) => !variant.isArchived);
          const names = visible.map((variant) => variant.name.trim().toLowerCase());
          const skus = visible.map((variant) => variant.sku.trim().toUpperCase());
          return new Set(names).size === names.length && new Set(skus).size === skus.length;
        },
        message: "At least one active variant with unique size and SKU is required.",
      },
    },
    featured: { type: Boolean, default: false },
    bestSeller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    codEnabled: { type: Boolean, default: true },
    onlinePaymentEnabled: { type: Boolean, default: true },
    returnEligible: { type: Boolean, default: true },
    exchangeEligible: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text", "variants.name": "text", "variants.sku": "text", slug: "text", tags: "text" });
productSchema.index({ featured: 1, isActive: 1, createdAt: -1 });
productSchema.index({ bestSeller: 1, isActive: 1, createdAt: -1 });
productSchema.index({ newArrival: 1, isActive: 1, createdAt: -1 });
productSchema.index({ sku: 1 }, { unique: true, sparse: true });
productSchema.index({ "variants.sku": 1 }, { unique: true, sparse: true });
productSchema.index({ "variants.stock": 1, "variants.isActive": 1 });

export default mongoose.model("Product", productSchema);


