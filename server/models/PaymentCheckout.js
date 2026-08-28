// Stores short-lived, server-authoritative Cashfree checkout references.
import mongoose from "mongoose";

const paymentCheckoutSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, default: "cashfree" },
    type: { type: String, enum: ["hosted", "upi_qr"], default: "hosted" },
    status: { type: String, enum: ["created", "processing", "paid", "expired", "failed", "cancelled"], default: "created", index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    cashfreeOrderId: { type: String, required: true, unique: true },
    cfOrderId: { type: String, sparse: true },
    cfPaymentId: { type: String, unique: true, sparse: true },
    paymentSessionId: { type: String, select: false },
    idempotencyKey: { type: String, required: true, unique: true, select: false },
    orderPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export default mongoose.model("PaymentCheckout", paymentCheckoutSchema);
