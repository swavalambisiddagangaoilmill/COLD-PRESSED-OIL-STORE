import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, index: true },
  phoneNumber: { type: String, index: true },
  otpHash: { type: String, required: true, select: false },
  purpose: { type: String, enum: ["signup", "login"], required: true },
  fullName: { type: String, trim: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  consumedAt: { type: Date },
  requestedByIpHash: { type: String, select: false },
  requestedByDeviceHash: { type: String, select: false },
}, { timestamps: true });

otpVerificationSchema.pre("validate", function requireIdentity(next) {
  if (!this.email && !this.phoneNumber) return next(new Error("OTP identity is required."));
  next();
});
otpVerificationSchema.index({ email: 1, purpose: 1, createdAt: -1 });
otpVerificationSchema.index({ phoneNumber: 1, purpose: 1, createdAt: -1 });

export default mongoose.model("OtpVerification", otpVerificationSchema);
