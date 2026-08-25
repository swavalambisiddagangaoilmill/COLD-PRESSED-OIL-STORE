// Customer order model.
import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    variantName: { type: String, required: true },
    sku: { type: String, required: true },
    image: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: "India" },
  },
  { _id: false }
);

const shippingStatuses = [
  "pending",
  "requires_details",
  "shiprocket_order_created",
  "awb_assigned",
  "pickup_generated",
  "label_generated",
  "manifest_generated",
  "ready_for_pickup",
  "picked_up",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "rto",
  "failed",
];

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: [orderItemSchema],
    shippingAddress: shippingAddressSchema,
    paymentMethod: { type: String, enum: ["cod", "razorpay", "card", "upi"], default: "cod" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    orderStatus: { type: String, enum: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"], default: "placed" },
    subtotal: { type: Number, min: 0 },
    shippingAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    couponCode: { type: String, trim: true, uppercase: true },
    couponDiscount: { type: Number, default: 0, min: 0 },
    couponUsageConsumedAt: { type: Date },
    shiprocketOrderId: { type: String },
    shiprocketShipmentId: { type: String },
    awbCode: { type: String },
    courierName: { type: String },
    shippingStatus: { type: String, enum: shippingStatuses, default: "pending" },
    trackingUrl: { type: String },
    pickupStatus: { type: String },
    estimatedDelivery: { type: Date },
    labelUrl: { type: String },
    manifestUrl: { type: String },
    shippingFailureReason: { type: String },
    readyToShipAt: { type: Date },
    handedOverAt: { type: Date },
    isMockShipment: { type: Boolean, default: false },
    mockShippingStep: { type: Number, default: 0 },
    mockShippingHistory: [{ status: String, label: String, createdAt: { type: Date, default: Date.now } }],
    inventoryRestoredAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ shiprocketShipmentId: 1 });
orderSchema.index({ awbCode: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
orderSchema.index({ razorpayOrderId: 1 }, { sparse: true });

export default mongoose.model("Order", orderSchema);
