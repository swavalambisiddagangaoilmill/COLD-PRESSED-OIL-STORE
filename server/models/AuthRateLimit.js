import mongoose from "mongoose";

const authRateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  scope: { type: String, required: true, index: true },
  hits: [{ type: Date, required: true }],
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export default mongoose.model("AuthRateLimit", authRateLimitSchema);
