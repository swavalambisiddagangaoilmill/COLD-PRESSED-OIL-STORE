import mongoose from "mongoose";

const adminCleanupLockSchema = new mongoose.Schema({
  _id: { type: String, default: "global" },
  operation: { type: mongoose.Schema.Types.ObjectId, ref: "AdminCleanupOperation" },
  lockedUntil: { type: Date, required: true },
}, { timestamps: true });

export default mongoose.model("AdminCleanupLock", adminCleanupLockSchema);
