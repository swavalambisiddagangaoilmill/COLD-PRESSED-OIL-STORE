import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, index: true },
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

otpVerificationSchema.index({ phoneNumber: 1, purpose: 1, createdAt: -1 });

export default mongoose.model("OtpVerification", otpVerificationSchema);
