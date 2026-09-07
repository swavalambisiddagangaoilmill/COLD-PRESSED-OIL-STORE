import mongoose from "mongoose";

const adminAuthOtpSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  lastSentAt: { type: Date, required: true },
  consumedAt: { type: Date },
}, { timestamps: true });

adminAuthOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model("AdminAuthOtp", adminAuthOtpSchema);
