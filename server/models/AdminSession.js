// Tracks active and pending admin login sessions.
import mongoose from "mongoose";

const adminSessionSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["pending", "active", "revoked"], default: "pending", index: true },
    sessionId: { type: String, required: true, unique: true },
    slot: { type: Number, min: 1, max: 3 },
    pendingTokenHash: { type: String, select: false },
    refreshTokenHash: { type: String, select: false },
    deviceName: { type: String, trim: true },
    browser: { type: String, trim: true },
    os: { type: String, trim: true },
    ip: { type: String, trim: true },
    location: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    loginAt: { type: Date },
    lastActiveAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
    revokeReason: { type: String, trim: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), index: { expires: 0 } },
  },
  { timestamps: true }
);

adminSessionSchema.index({ admin: 1, status: 1, lastActiveAt: -1 });

export default mongoose.model("AdminSession", adminSessionSchema);
