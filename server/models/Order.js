// Customer order model.
import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true },
    image: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    variant: { type: mongoose.Schema.Types.ObjectId },
    variantLabel: { type: String },
    variantSku: { type: String },
    litreSize: { type: Number, min: 0 },
    requiredStockLitres: { type: Number, min: 0 },
    shippingWeight: { type: Number, min: 0.01 },
    dimensions: { type: new mongoose.Schema({ length: { type: Number, min: 0.01 }, width: { type: Number, min: 0.01 }, height: { type: Number, min: 0.01 } }, { _id: false }) },
    basePrice: { type: Number, min: 0 },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: "Offer" },
    offerName: { type: String },
    offerPercentage: { type: Number, min: 0, max: 100 },
    offerDiscount: { type: Number, min: 0, default: 0 },
    lineOfferDiscount: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0 },
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
  "ndr",
  "rto",
  "failed",
];

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: [orderItemSchema],
    shippingAddress: shippingAddressSchema,
    paymentMethod: { type: String, enum: ["cod", "cashfree", "razorpay", "card", "upi"], default: "cod" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    cashfreeOrderId: { type: String },
    cashfreeCfOrderId: { type: String },
    cashfreePaymentId: { type: String },
    orderStatus: { type: String, enum: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"], default: "placed" },
    productSubtotal: { type: Number, min: 0 },
    offerDiscount: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, min: 0 },
    shippingAmount: { type: Number, default: 0, min: 0 },
    shiprocketShippingCost: { type: Number, default: 0, min: 0 },
    selectedCourierId: { type: Number },
    selectedCourierService: { type: String },
    deliveryPincode: { type: String },
    shipmentWeight: { type: Number, min: 0 },
    shipmentDimensions: { type: new mongoose.Schema({ length: { type: Number, min: 0.01 }, width: { type: Number, min: 0.01 }, height: { type: Number, min: 0.01 } }, { _id: false }) },
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
    shipmentBookedAt: { type: Date },
    readyToShipAt: { type: Date },
    pickupRequestStartedAt: { type: Date },
    pickupRequestedAt: { type: Date },
    handedOverAt: { type: Date },
    statusHistory: [{ status: { type: String, required: true }, source: { type: String, enum: ["order", "admin", "shiprocket"], default: "order" }, createdAt: { type: Date, default: Date.now } }],
    confirmedAt: { type: Date },
    confirmationEmailSentAt: { type: Date },
    cancellationEmailSentAt: { type: Date },
    shipmentEmailSentAt: { type: Date },
    trackingTimeline: [{
      fingerprint: { type: String, required: true },
      status: { type: String, required: true },
      providerStatus: { type: String },
      providerStatusCode: { type: String },
      location: { type: String },
      description: { type: String },
      occurredAt: { type: Date, required: true },
      source: { type: String, enum: ["webhook", "tracking_api"], required: true },
    }],
    processedTrackingEvents: [{ type: String }],
    shipmentNotificationEvents: [{ type: String }],
    lastTrackingSyncAt: { type: Date },
    lastProviderStatus: { type: String },
    lastProviderStatusCode: { type: String },
    shipmentCancelledAt: { type: Date },
    shipmentCancellationStatus: { type: String },
    shipmentCreationStartedAt: { type: Date },
    shipmentAttemptCount: { type: Number, default: 0, min: 0 },
    shipmentLastAttemptAt: { type: Date },
    cartCleanupCompletedAt: { type: Date },
    inventoryRestoredAt: { type: Date },
  },
  { timestamps: true, toJSON: { transform(_doc, value) { delete value.shiprocketShippingCost; delete value.selectedCourierId; delete value.selectedCourierService; return value; } } }
);

orderSchema.index({ shiprocketShipmentId: 1 });
orderSchema.index({ awbCode: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
orderSchema.index({ razorpayOrderId: 1 }, { sparse: true });
orderSchema.index({ cashfreePaymentId: 1 }, { unique: true, sparse: true });
orderSchema.index({ cashfreeOrderId: 1 }, { unique: true, sparse: true });

export default mongoose.model("Order", orderSchema);
