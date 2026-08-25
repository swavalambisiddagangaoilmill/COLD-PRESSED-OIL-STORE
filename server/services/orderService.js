// Order business logic.
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { createAdminNotification, createInventoryNotifications } from "./adminNotificationService.js";
import { calculateCheckoutTotals, consumeCouponUsageForOrder, normalizeCouponCode, validateCouponForItems } from "./couponService.js";
import { sendOrderTrackingMessage } from "./whatsappService.js";
import { env } from "../config/env.js";
import { assertOrderStatusTransition } from "./orderStatusPolicy.js";

function normalizeOrderProducts(products = []) {
  const merged = new Map();
  products.forEach((item) => {
    const product = item.product?.toString?.() || item.product;
    const variantId = item.variantId?.toString?.() || item.variant?.toString?.() || item.variantId || item.variant;
    if (!product || !variantId) return;
    const key = `${product}:${variantId}`;
    const current = merged.get(key) || { product, variantId, quantity: 0 };
    current.quantity += Math.max(1, Number(item.quantity) || 1);
    merged.set(key, current);
  });
  return [...merged.values()];
}

async function rollbackStock(updates) {
  await Promise.all(updates.map((item) => Product.updateOne({ _id: item.product, "variants._id": item.variant }, { $inc: { "variants.$.stock": item.quantity } })));
}

export function buildVariantOrderItem(product, item, paymentMethod = "cod") {
  const variant = product?.variants?.id ? product.variants.id(item.variantId) : product?.variants?.find((entry) => String(entry._id) === String(item.variantId));
  if (!variant || !variant.isActive || variant.isArchived) throw new ApiError(`${product?.title || "Product"} variant is unavailable.`, 400);
  if (variant.stock < item.quantity) throw new ApiError(`${product.title} ${variant.name} does not have enough stock.`, 400);
  if (paymentMethod === "cod" && product.codEnabled === false) throw new ApiError(`${product.title} is not eligible for Cash on delivery.`, 400);
  if (paymentMethod !== "cod" && product.onlinePaymentEnabled === false) throw new ApiError(`${product.title} is not eligible for online payment.`, 400);
  const price = variant.price;
  return { product: product._id, variant: variant._id, title: product.title, variantName: variant.name, sku: variant.sku, image: variant.images?.[0]?.url, quantity: item.quantity, price, mrp: variant.mrp, total: price * item.quantity };
}

export function customerOrderPaymentState() {
  return { paymentMethod: "cod", paymentStatus: "pending" };
}

async function createOrderInternal(userId, payload, trustedPayment = {}) {
  const requestedItems = normalizeOrderProducts(payload.products);
  if (!requestedItems.length) throw new ApiError("At least one product is required.", 400);
  const productIds = requestedItems.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const paymentMethod = trustedPayment.paymentMethod || "cod";

  const orderItems = requestedItems.map((item) => {
    const product = productMap.get(item.product.toString());
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    return buildVariantOrderItem(product, item, paymentMethod);
  });

  const couponResult = await validateCouponForItems({ code: payload.couponCode, userId, items: orderItems });
  const successfulUpdates = [];
  for (const item of orderItems) {
    const result = await Product.updateOne({ _id: item.product, variants: { $elemMatch: { _id: item.variant, stock: { $gte: item.quantity }, isActive: true, isArchived: { $ne: true } } }, isActive: true }, { $inc: { "variants.$.stock": -item.quantity } });
    if (result.modifiedCount !== 1) {
      await rollbackStock(successfulUpdates);
      throw new ApiError("One or more products do not have enough stock.", 400);
    }
    successfulUpdates.push({ product: item.product, variant: item.variant, quantity: item.quantity });
  }

  try {
    const totals = calculateCheckoutTotals(orderItems, couponResult.discountAmount);
    const order = await Order.create({ user: userId, products: orderItems, shippingAddress: payload.shippingAddress, paymentMethod, paymentStatus: trustedPayment.paymentStatus || "pending", razorpayOrderId: trustedPayment.razorpayOrderId, razorpayPaymentId: trustedPayment.razorpayPaymentId, razorpaySignature: trustedPayment.razorpaySignature, subtotal: totals.subtotal, shippingAmount: totals.shippingAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount, couponCode: normalizeCouponCode(payload.couponCode) || undefined, couponDiscount: totals.discountAmount });
    try {
      await consumeCouponUsageForOrder(order);
    } catch (error) {
      await Order.findByIdAndDelete(order._id);
      throw error;
    }
    await Promise.allSettled([
      createAdminNotification({ category: "orders", type: "new_order", title: "New Order", description: `Order ${order._id} was placed for Rs. ${totals.totalAmount}.`, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/orders" } }),
      ...productIds.map((id) => Product.findById(id).then((product) => product && createInventoryNotifications(product))),
    ]);
    const customer = await User.findById(userId).select("phone").lean();
    if (customer?.phone) {
      const summary = orderItems.map((item) => `${item.title} - ${item.variantName} x ${item.quantity}`).join(", ");
      await Promise.allSettled([sendOrderTrackingMessage(customer.phone, String(order._id), `${env.clientUrl}/track/${order._id}`, summary)]);
    }
    return order;
  } catch (error) {
    await rollbackStock(successfulUpdates);
    throw error;
  }
}

// Customer-created orders are always COD/pending. Browser-supplied payment state is ignored.
export function createOrder(userId, payload) {
  return createOrderInternal(userId, payload, customerOrderPaymentState());
}

// Only verified server-side payment flows may call this entry point.
export function createVerifiedPaymentOrder(userId, payload, payment) {
  return createOrderInternal(userId, payload, {
    paymentMethod: "razorpay",
    paymentStatus: "paid",
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    razorpaySignature: payment.razorpaySignature,
  });
}

export function getMyOrders(userId) {
  return Order.find({ user: userId }).sort({ createdAt: -1 }).lean();
}

export async function getOrderForUser(orderId, user) {
  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) throw new ApiError("Order not found.", 404);
  if (user.role !== "admin" && order.user._id.toString() !== user._id.toString()) {
    throw new ApiError("You cannot access this order.", 403);
  }
  return order;
}

export function getAllOrders() {
  return Order.find().populate("user", "name email").sort({ createdAt: -1 }).lean();
}

export async function updateOrderStatus(orderId, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError("Order not found.", 404);
  const nextStatus = payload.orderStatus;
  assertOrderStatusTransition(order.orderStatus, nextStatus);
  const previousStatus = order.orderStatus;
  const previousShippingStatus = order.shippingStatus;
  order.orderStatus = nextStatus;
  if (nextStatus === "cancelled") order.shippingStatus = "cancelled";
  if (nextStatus === "shipped" && !["picked_up", "in_transit", "out_for_delivery"].includes(order.shippingStatus)) order.shippingStatus = "shipped";
  if (nextStatus === "delivered") order.shippingStatus = "delivered";
  await order.save();
  if (nextStatus === "cancelled" && !order.inventoryRestoredAt) {
    try {
      await Product.bulkWrite(order.products.map((item) => ({ updateOne: { filter: { _id: item.product, "variants._id": item.variant }, update: { $inc: { "variants.$.stock": item.quantity } } } })));
      order.inventoryRestoredAt = new Date();
      await order.save();
    } catch (error) {
      order.orderStatus = previousStatus;
      order.shippingStatus = previousShippingStatus;
      await order.save().catch(() => undefined);
      throw new ApiError("Unable to restore variant stock, so the cancellation was rolled back.", 500);
    }
  }
  const notification = nextStatus === "cancelled"
    ? { type: "order_cancelled", title: "Order Cancelled", description: `Order ${order._id} was cancelled.` }
    : nextStatus === "delivered" ? { type: "order_delivered", title: "Order Delivered", description: `Order ${order._id} was delivered.` } : null;
  if (notification) await Promise.allSettled([createAdminNotification({ category: "orders", ...notification, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/orders" } })]);
  return order;
}

