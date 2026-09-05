import mongoose from "mongoose";

const adminCleanupOperationSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  dataType: { type: String, required: true, index: true },
  mode: { type: String, enum: ["selected", "dateRange", "all"], required: true },
  filter: { type: mongoose.Schema.Types.Mixed, default: {} },
  targetIds: [{ type: mongoose.Schema.Types.ObjectId }],
  targetCount: { type: Number, required: true, min: 0 },
  deletedCount: { type: Number, default: 0, min: 0 },
  confirmationPhrase: { type: String, required: true, select: false },
  warnings: [{ type: String }],
  blockers: [{ type: String }],
  backupIdentifier: { type: String, index: true },
  backupStatus: { type: String, enum: ["pending", "verified", "failed"], default: "pending" },
  backupChecksum: { type: String, select: false },
  backupCiphertext: { type: String, select: false },
  backupIv: { type: String, select: false },
  backupAuthTag: { type: String, select: false },
  status: { type: String, enum: ["previewed", "running", "completed", "failed", "blocked"], default: "previewed", index: true },
  errorMessage: { type: String },
  requestKey: { type: String, unique: true, sparse: true },
  expiresAt: { type: Date, required: true, index: true },
  completedAt: { type: Date },
}, { timestamps: true });

adminCleanupOperationSchema.index({ createdAt: -1 });

export default mongoose.model("AdminCleanupOperation", adminCleanupOperationSchema);
