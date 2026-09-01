import mongoose from "mongoose";

const customerAuthOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, trim: true },
  flow: { type: String, enum: ["login", "signup"], required: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  lastSentAt: { type: Date, required: true },
  requestWindowStartedAt: { type: Date, required: true },
  requestCount: { type: Number, default: 1 },
  consumedAt: { type: Date },
  requestIpHash: { type: String, select: false },
}, { timestamps: true });

customerAuthOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model("CustomerAuthOtp", customerAuthOtpSchema);
