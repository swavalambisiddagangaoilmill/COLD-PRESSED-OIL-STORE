// Order business logic.
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { withOrderTotals } from "../utils/orderTotals.js";
import { createAdminNotification, createInventoryNotifications } from "./adminNotificationService.js";
import { calculateCheckoutTotals, consumeCouponUsageForOrder, normalizeCouponCode, validateCouponForItems } from "./couponService.js";
import { priceProducts } from "./offerPricingService.js";
import { requiredStockLitres as calculateRequiredLitres, variantLitres } from "./variantInventoryService.js";

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
    const variant = item.variant?.toString?.() || item.variant || "";
    const key = `${product}:${variant}`;
    const current = merged.get(key) || { product, variant: variant || undefined, quantity: 0 };
    current.quantity += Math.max(1, Number(item.quantity) || 1);
    merged.set(key, current);
  });
  return [...merged.values()];
}

async function rollbackStock(updates) {
  await Promise.all(updates.map((item) => item.variant
    ? Product.updateOne({ _id: item.product, "variants._id": item.variant }, { $inc: { "variants.$.stock": item.requiredStockLitres } })
    : Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })));
}

export async function createOrder(userId, payload) {
  const requestedItems = normalizeOrderProducts(payload.products);
  if (!requestedItems.length) throw new ApiError("At least one product is required.", 400);
  const productIds = requestedItems.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const pricedProducts = await priceProducts(products);
  const productMap = new Map(pricedProducts.map((product) => [product._id.toString(), product]));

  const paymentMethod = payload.paymentMethod || "cod";

  const orderItems = requestedItems.map((item) => {
    const product = productMap.get(item.product.toString());
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    const variant = item.variant ? product.variants?.find((value) => String(value._id) === String(item.variant)) : null;
    if (item.variant && !variant) throw new ApiError("Selected variant does not belong to this product.", 400);
    if (variant?.isActive === false) throw new ApiError(`${product.title} (${variant.size}) is unavailable.`, 400);
    const litreSize = variant ? variantLitres(variant) : 1;
    const requiredStockLitres = variant ? calculateRequiredLitres(variant, item.quantity) : item.quantity;
    const stock = variant ? variant.stock : product.stock;
    if (stock < requiredStockLitres) throw new ApiError(`${product.title}${variant ? ` · ${variant.size}` : ""} is no longer available in the requested quantity. Only ${stock}L remains.`, 400);
    if (paymentMethod === "cod" && product.codEnabled === false) throw new ApiError(`${product.title} is not eligible for Cash on delivery.`, 400);
    if (paymentMethod !== "cod" && product.onlinePaymentEnabled === false) throw new ApiError(`${product.title} is not eligible for online payment.`, 400);
    const priced = variant || product;
    const price = priced.effectivePrice;
    return { product: product._id, category: product.category, title: product.title, image: priced.images?.[0]?.url || product.images?.[0]?.url, quantity: item.quantity, price, variant: variant?._id, variantLabel: variant?.size, variantSku: variant?.sku || product.sku, litreSize, requiredStockLitres, basePrice: priced.baseSellingPrice, offerId: priced.appliedOffer?.id, offerName: priced.appliedOffer?.name, offerPercentage: priced.appliedOffer?.percentage, offerDiscount: priced.discountAmount, lineOfferDiscount: priced.discountAmount * item.quantity, lineTotal: price * item.quantity };
  });

  const couponResult = await validateCouponForItems({ code: payload.couponCode, userId, items: orderItems });
  const successfulUpdates = [];
  for (const item of orderItems) {
    const result = item.variant
      ? await Product.updateOne({ _id: item.product, isActive: true, variants: { $elemMatch: { _id: item.variant, isActive: { $ne: false }, stock: { $gte: item.requiredStockLitres } } } }, { $inc: { "variants.$[variant].stock": -item.requiredStockLitres } }, { arrayFilters: [{ "variant._id": item.variant }] })
      : await Product.updateOne({ _id: item.product, stock: { $gte: item.quantity }, isActive: true }, { $inc: { stock: -item.quantity } });
    if (result.modifiedCount !== 1) {
      await rollbackStock(successfulUpdates);
      throw new ApiError("One or more products do not have enough stock.", 400);
    }
    successfulUpdates.push({ product: item.product, variant: item.variant, quantity: item.quantity, requiredStockLitres: item.requiredStockLitres });
  }

  let persistedOrder = null;
  try {
    const totals = calculateCheckoutTotals(orderItems, couponResult.discountAmount);
    const order = await Order.create({ user: userId, products: orderItems, shippingAddress: payload.shippingAddress, paymentMethod, paymentStatus: payload.paymentStatus || "pending", razorpayOrderId: payload.razorpayOrderId, razorpayPaymentId: payload.razorpayPaymentId, razorpaySignature: payload.razorpaySignature, cashfreeOrderId: payload.cashfreeOrderId, cashfreeCfOrderId: payload.cashfreeCfOrderId, cashfreePaymentId: payload.cashfreePaymentId, subtotal: totals.subtotal, shippingAmount: totals.shippingAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount, couponCode: normalizeCouponCode(payload.couponCode) || undefined, couponDiscount: totals.discountAmount, statusHistory: [{ status: "placed", source: "order", createdAt: new Date() }] });
    persistedOrder = order;
    try {
      await consumeCouponUsageForOrder(order);
    } catch (error) {
      await Order.findByIdAndDelete(order._id);
      persistedOrder = null;
      throw error;
    }
    await ensureOrderCartCleanup(order);
    await Promise.allSettled([
      createAdminNotification({ category: "orders", type: "new_order", title: "New Order", description: `Order ${order._id} was placed for Rs. ${totals.totalAmount}.`, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/orders" } }),
      ...productIds.map((id) => Product.findById(id).then((product) => product && createInventoryNotifications(product))),
    ]);
    return order;
  } catch (error) {
    if (!persistedOrder) await rollbackStock(successfulUpdates);
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
  const result = await User.updateOne({ _id: userId }, { $pull: { cart: { product: { $in: productIds } } } });
  if (result.matchedCount !== undefined && result.matchedCount !== 1) throw new ApiError("Customer cart could not be reconciled.", 409);
}

export async function ensureOrderCartCleanup(order) {
  if (!order || order.cartCleanupCompletedAt) return order;
  const productIds = (Array.isArray(order.products) ? order.products : []).map((item) => item?.product).filter(Boolean);
  await clearPurchasedCart(order.user, productIds);
  const completedAt = new Date();
  await Order.updateOne({ _id: order._id, cartCleanupCompletedAt: null }, { $set: { cartCleanupCompletedAt: completedAt } });
  order.cartCleanupCompletedAt = completedAt;
  return order;
}
