// Durable WhatsApp marketing campaign state without storing recipient phone numbers.
import mongoose from "mongoose";

const recipientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["queued", "sending", "sent", "delivered", "read", "failed", "skipped"], default: "queued" },
  providerMessageId: { type: String },
  failureCode: { type: String, trim: true },
  processedAt: { type: Date },
}, { _id: false });

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  templateId: { type: String, required: true, trim: true },
  variables: { type: Map, of: String, default: {} },
  audience: { type: String, enum: ["opted_in_customers", "recent_customers", "previous_buyers", "individual_customers"], required: true },
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  idempotencyKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ["queued", "sending", "completed", "partially_failed", "failed"], default: "queued", index: true },
  recipientCount: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  readCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  recipients: { type: [recipientSchema], default: [] },
  startedAt: { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

campaignSchema.index({ initiatedBy: 1, createdAt: -1 });
campaignSchema.index({ "recipients.providerMessageId": 1 }, { sparse: true });

export default mongoose.model("WhatsAppCampaign", campaignSchema);
