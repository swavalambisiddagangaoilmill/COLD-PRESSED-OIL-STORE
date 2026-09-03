// Order business logic.
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { withOrderTotals } from "../utils/orderTotals.js";
import { createAdminNotification, createInventoryNotifications } from "./adminNotificationService.js";
import { calculateCheckoutTotals, consumeCouponUsageForOrder, normalizeCouponCode, validateCouponForItems } from "./couponService.js";

const orderTransitions = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

function normalizeOrderProducts(products = []) {
  const merged = new Map();
  products.forEach((item) => {
    const product = item.product?.toString?.() || item.product;
    if (!product) return;
    merged.set(product, (merged.get(product) || 0) + Math.max(1, Number(item.quantity) || 1));
  });
  return [...merged.entries()].map(([product, quantity]) => ({ product, quantity }));
}

async function rollbackStock(updates) {
  await Promise.all(updates.map((item) => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })));
}

export async function createOrder(userId, payload) {
  const requestedItems = normalizeOrderProducts(payload.products);
  if (!requestedItems.length) throw new ApiError("At least one product is required.", 400);
  const productIds = requestedItems.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const paymentMethod = payload.paymentMethod || "cod";

  const orderItems = requestedItems.map((item) => {
    const product = productMap.get(item.product.toString());
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    if (product.stock < item.quantity) throw new ApiError(`${product.title} does not have enough stock.`, 400);
    if (paymentMethod === "cod" && product.codEnabled === false) throw new ApiError(`${product.title} is not eligible for Cash on delivery.`, 400);
    if (paymentMethod !== "cod" && product.onlinePaymentEnabled === false) throw new ApiError(`${product.title} is not eligible for online payment.`, 400);
    const price = product.discountPrice || product.price;
    return { product: product._id, category: product.category, title: product.title, image: product.images?.[0]?.url, quantity: item.quantity, price };
  });

  const couponResult = await validateCouponForItems({ code: payload.couponCode, userId, items: orderItems });
  const successfulUpdates = [];
  for (const item of orderItems) {
    const result = await Product.updateOne({ _id: item.product, stock: { $gte: item.quantity }, isActive: true }, { $inc: { stock: -item.quantity } });
    if (result.modifiedCount !== 1) {
      await rollbackStock(successfulUpdates);
      throw new ApiError("One or more products do not have enough stock.", 400);
    }
    successfulUpdates.push({ product: item.product, quantity: item.quantity });
  }

  try {
    const totals = calculateCheckoutTotals(orderItems, couponResult.discountAmount);
    const order = await Order.create({ user: userId, products: orderItems, shippingAddress: payload.shippingAddress, paymentMethod, paymentStatus: payload.paymentStatus || "pending", razorpayOrderId: payload.razorpayOrderId, razorpayPaymentId: payload.razorpayPaymentId, razorpaySignature: payload.razorpaySignature, cashfreeOrderId: payload.cashfreeOrderId, cashfreeCfOrderId: payload.cashfreeCfOrderId, cashfreePaymentId: payload.cashfreePaymentId, subtotal: totals.subtotal, shippingAmount: totals.shippingAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount, couponCode: normalizeCouponCode(payload.couponCode) || undefined, couponDiscount: totals.discountAmount });
    try {
      await consumeCouponUsageForOrder(order);
    } catch (error) {
      await Order.findByIdAndDelete(order._id);
      throw error;
    }
    await clearPurchasedCart(userId, productIds);
    await Promise.allSettled([
      createAdminNotification({ category: "orders", type: "new_order", title: "New Order", description: `Order ${order._id} was placed for Rs. ${totals.totalAmount}.`, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/orders" } }),
      ...productIds.map((id) => Product.findById(id).then((product) => product && createInventoryNotifications(product))),
    ]);
    return order;
  } catch (error) {
    await rollbackStock(successfulUpdates);
    throw error;
  }
}

export async function getMyOrders(userId) {
  return (await Order.find({ user: userId }).sort({ createdAt: -1 }).lean()).map(withOrderTotals);
}

export async function getOrderForUser(orderId, user) {
  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) throw new ApiError("Order not found.", 404);
  if (user.role !== "admin" && order.user._id.toString() !== user._id.toString()) {
    throw new ApiError("You cannot access this order.", 403);
  }
  return withOrderTotals(order);
}

export async function getAllOrders() {
  return (await Order.find().populate("user", "name email").sort({ createdAt: -1 }).lean()).map(withOrderTotals);
}

export async function updateOrderStatus(orderId, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError("Order not found.", 404);
  const nextStatus = payload.orderStatus;
  if (!orderTransitions[order.orderStatus]?.includes(nextStatus)) throw new ApiError("Invalid order status transition.", 400);
  order.orderStatus = nextStatus;
  if (nextStatus === "cancelled") order.shippingStatus = "cancelled";
  if (nextStatus === "shipped" && !["picked_up", "in_transit", "out_for_delivery"].includes(order.shippingStatus)) order.shippingStatus = "shipped";
  if (nextStatus === "delivered") order.shippingStatus = "delivered";
  await order.save();
  const notification = nextStatus === "cancelled" ? { type: "order_cancelled", title: "Order Cancelled", description: `Order ${order._id} was cancelled.` } : nextStatus === "delivered" ? { type: "order_delivered", title: "Order Delivered", description: `Order ${order._id} was delivered.` } : null;
  if (notification) await Promise.allSettled([createAdminNotification({ category: "orders", ...notification, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/orders" } })]);
  return order;
}

export async function clearPurchasedCart(userId, productIds) {
  if (!productIds.length) return;
  await User.updateOne({ _id: userId }, { $pull: { cart: { product: { $in: productIds } } } });
}
