// Stores hashed customer login OTP challenges with expiry and attempt limits.
import mongoose from "mongoose";

const customerOtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, index: true },
    codeHash: { type: String, required: true, select: false },
    provider: { type: String, trim: true, default: "msg91" },
    purpose: { type: String, enum: ["customer_login"], default: "customer_login" },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    resendCount: { type: Number, default: 0 },
    resendAvailableAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 300 } },
    consumedAt: { type: Date },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
  },
  { timestamps: true }
);

customerOtpSchema.index({ phone: 1, purpose: 1, consumedAt: 1 });

export default mongoose.model("CustomerOtp", customerOtpSchema);