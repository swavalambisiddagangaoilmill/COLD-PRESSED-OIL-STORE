// Admin-managed offer model.
import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    discountType: { type: String, enum: ["PERCENTAGE", "FIXED"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    targetType: { type: String, enum: ["CATEGORY", "VARIANT", "CUSTOM"] },
    scope: { type: String, enum: ["STORE", "CATEGORY", "PRODUCTS"], default: "STORE" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    variants: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true }, variant: { type: mongoose.Schema.Types.ObjectId, required: true }, _id: false }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    bannerText: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fingerprint: { type: String, unique: true, sparse: true, select: false },
  },
  { timestamps: true }
);

offerSchema.pre("validate", function validateTarget(next) {
  if (this.discountType === "PERCENTAGE" && (this.discountValue <= 0 || this.discountValue > 100)) this.invalidate("discountValue", "Discount percentage must be between 0 and 100.");
  if (this.endDate <= this.startDate) this.invalidate("endDate", "Offer end date must be after its start date.");
  if (this.targetType === "CATEGORY" && !this.categories.length) this.invalidate("categories", "Select at least one category.");
  if (this.targetType === "VARIANT" && !this.variants.length) this.invalidate("variants", "Select at least one variant.");
  if (this.targetType === "CUSTOM" && !this.categories.length && !this.products.length && !this.variants.length) this.invalidate("targetType", "Select at least one category, product, or variant.");
  if (this.targetType) {
    const values = [this.name.trim().toLowerCase(), this.targetType, [...this.categories].map(String).sort().join(","), [...this.products].map(String).sort().join(","), [...this.variants].map((item) => `${item.product}:${item.variant}`).sort().join(","), new Date(this.startDate).toISOString(), new Date(this.endDate).toISOString()];
    this.fingerprint = values.join("|");
  }
  next();
});

offerSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
offerSchema.index({ categories: 1, products: 1 });
export default mongoose.model("Offer", offerSchema);

