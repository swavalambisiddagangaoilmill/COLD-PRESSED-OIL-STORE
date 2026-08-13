// Product catalog model.
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true },
    benefits: [{ type: String, trim: true }],
    sku: { type: String, trim: true, uppercase: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    price: { type: Number, required: true, min: 0.01 },
    discountPrice: { type: Number, min: 0.01 },
    stock: { type: Number, default: 0, min: 0 },
    weight: { type: Number, min: 0.01 },
    dimensions: { length: { type: Number, min: 0.01 }, width: { type: Number, min: 0.01 }, height: { type: Number, min: 0.01 } },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    images: [{ url: { type: String, required: true }, publicId: { type: String } }],
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

productSchema.index({ title: "text", description: "text", sku: "text", slug: "text", tags: "text" });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ featured: 1, isActive: 1, createdAt: -1 });
productSchema.index({ bestSeller: 1, isActive: 1, createdAt: -1 });
productSchema.index({ newArrival: 1, isActive: 1, createdAt: -1 });
productSchema.index({ stock: 1, isActive: 1 });

export default mongoose.model("Product", productSchema);


