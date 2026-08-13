// Coupon code model for admin management and checkout validation.
import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true },
    discountType: { type: String, enum: ["PERCENTAGE", "FIXED"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minimumOrderAmount: { type: Number, default: 0, min: 0 },
    maximumDiscountAmount: { type: Number, default: 0, min: 0 },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    usageLimit: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    consumedOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order", select: false }],
    perCustomerUsageLimit: { type: Number, default: 1, min: 0 },
    scope: { type: String, enum: ["ALL", "CATEGORY", "PRODUCTS"], default: "ALL" },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    firstOrderOnly: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

couponSchema.pre("validate", function normalizeCode(next) {
  if (this.code) this.code = this.code.trim().toUpperCase();
  next();
});

export default mongoose.model("Coupon", couponSchema);
