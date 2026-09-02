// Stores short-lived Razorpay QR checkout references.
import mongoose from "mongoose";

const paymentCheckoutSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, default: "cashfree" },
    type: { type: String, enum: ["hosted_checkout"], default: "hosted_checkout" },
    status: { type: String, enum: ["created", "processing", "paid", "expired", "failed", "cancelled"], default: "created", index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    cashfreeOrderId: { type: String, required: true, unique: true },
    cashfreeCfOrderId: { type: String },
    cashfreePaymentId: { type: String, unique: true, sparse: true },
    paymentSessionId: { type: String, select: false },
    razorpayQrId: { type: String, select: false },
    idempotencyKey: { type: String, select: false },
    orderPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("PaymentCheckout", paymentCheckoutSchema);
