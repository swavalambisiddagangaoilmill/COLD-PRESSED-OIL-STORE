// Coupon validation shared by storefront checkout and order creation.
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { priceProducts } from "./offerPricingService.js";

export const COUPON_REASONS = Object.freeze({
  NOT_FOUND: "COUPON_NOT_FOUND",
  EXPIRED: "COUPON_EXPIRED",
  INACTIVE: "COUPON_INACTIVE",
  NOT_STARTED: "COUPON_NOT_STARTED",
  USAGE_LIMIT: "COUPON_USAGE_LIMIT_REACHED",
  ALREADY_USED: "COUPON_ALREADY_USED",
  MINIMUM_ORDER: "COUPON_MINIMUM_ORDER_NOT_REACHED",
  INVALID_CONFIGURATION: "COUPON_INVALID_CONFIGURATION",
  NOT_APPLICABLE: "COUPON_NOT_APPLICABLE",
  FIRST_ORDER_ONLY: "COUPON_FIRST_ORDER_ONLY",
});

function couponError(reason, message) {
  return new ApiError(message, 400, [], reason);
}

export function normalizeCouponCode(code = "") {
  return String(code || "").trim().toUpperCase();
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function couponDateBounds(coupon) {
  const start = dateKey(coupon?.startDate);
  const expiry = dateKey(coupon?.expiryDate);
  return {
    start: start ? new Date(`${start}T00:00:00.000+05:30`) : null,
    expiry: expiry ? new Date(`${expiry}T23:59:59.999+05:30`) : null,
  };
}

export function calculateCheckoutTotals(items = [], couponDiscount = 0, shippingAmount = 0) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const safeShippingAmount = Math.max(0, Number(shippingAmount) || 0);
  const taxAmount = 0;
  const discountAmount = Math.max(0, Math.min(subtotal, Math.round(Number(couponDiscount) || 0)));
  return { subtotal, shippingAmount: safeShippingAmount, taxAmount, discountAmount, totalAmount: Math.max(0, subtotal + safeShippingAmount - discountAmount) };
}

export function assertCouponEligibility(coupon, now = new Date()) {
  if (!coupon) throw couponError(COUPON_REASONS.NOT_FOUND, "Coupon code not found.");
  if (!coupon.isActive) throw couponError(COUPON_REASONS.INACTIVE, "This coupon is currently unavailable.");
  const bounds = couponDateBounds(coupon);
  const validDiscount = ["PERCENTAGE", "FIXED"].includes(coupon.discountType)
    && Number.isFinite(Number(coupon.discountValue))
    && Number(coupon.discountValue) > 0
    && (coupon.discountType !== "PERCENTAGE" || Number(coupon.discountValue) <= 100);
  if (!bounds.start || !bounds.expiry || bounds.start > bounds.expiry || !validDiscount) {
    throw couponError(COUPON_REASONS.INVALID_CONFIGURATION, "This coupon cannot be applied right now.");
  }
  if (now < bounds.start) throw couponError(COUPON_REASONS.NOT_STARTED, "This coupon is not active yet.");
  if (now > bounds.expiry) throw couponError(COUPON_REASONS.EXPIRED, "This coupon has expired.");
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw couponError(COUPON_REASONS.USAGE_LIMIT, "This coupon has reached its usage limit.");
}

export function calculateCouponDiscount(coupon, discountBase, orderSubtotal = discountBase) {
  const rawDiscount = coupon.discountType === "PERCENTAGE" ? Math.round(discountBase * (coupon.discountValue / 100)) : coupon.discountValue;
  const cappedDiscount = coupon.maximumDiscountAmount > 0 ? Math.min(rawDiscount, coupon.maximumDiscountAmount) : rawDiscount;
  return Math.max(0, Math.min(orderSubtotal, Math.round(cappedDiscount)));
}

function itemProductId(item) {
  return item.product?._id?.toString?.() || item.product?.toString?.() || item._id?.toString?.() || item.id?.toString?.();
}

function itemCategoryId(item) {
  const product = item.product?._id ? item.product : item;
  return product.category?._id?.toString?.() || product.category?.toString?.();
}

function lineTotal(item) {
  return Number(item.price || 0) * Number(item.quantity || 1);
}

export async function validateCouponForItems({ code, userId, items = [], subtotal }) {
  const couponCode = normalizeCouponCode(code);
  if (!couponCode) return { coupon: null, discountAmount: 0 };

  const coupon = await Coupon.findOne({ code: couponCode });
  const now = new Date();
  assertCouponEligibility(coupon, now);

  const orderSubtotal = Number(subtotal ?? items.reduce((sum, item) => sum + lineTotal(item), 0));
  if (orderSubtotal < coupon.minimumOrderAmount) {
    const amountMore = Math.max(0, coupon.minimumOrderAmount - orderSubtotal);
    throw couponError(COUPON_REASONS.MINIMUM_ORDER, `Add ₹${amountMore.toLocaleString("en-IN")} more to use this coupon.`);
  }

  if (coupon.firstOrderOnly && userId) {
    const existingOrders = await Order.countDocuments({ user: userId });
    if (existingOrders > 0) throw couponError(COUPON_REASONS.FIRST_ORDER_ONLY, "This coupon is available only on your first order.");
  }
  if (coupon.perCustomerUsageLimit > 0 && userId) {
    const customerUses = await Order.countDocuments({ user: userId, couponCode, couponUsageConsumedAt: { $exists: true } });
    if (customerUses >= coupon.perCustomerUsageLimit) throw couponError(COUPON_REASONS.ALREADY_USED, "You have already used this coupon.");
  }

  const productIds = new Set((coupon.products || []).map((id) => id.toString()));
  const categoryIds = new Set((coupon.categories || []).map((id) => id.toString()));
  const eligibleItems = items.filter((item) => {
    if (coupon.scope === "PRODUCTS") return productIds.has(itemProductId(item));
    if (coupon.scope === "CATEGORY") return categoryIds.has(itemCategoryId(item));
    return true;
  });
  if (!eligibleItems.length) throw couponError(COUPON_REASONS.NOT_APPLICABLE, "This coupon does not apply to the selected products.");

  const discountBase = eligibleItems.reduce((sum, item) => sum + lineTotal(item), 0);
  return { coupon, discountAmount: calculateCouponDiscount(coupon, discountBase, orderSubtotal) };
}

export async function consumeCouponUsage(coupon) {
  if (!coupon) return;
  const filter = { _id: coupon._id, isActive: true };
  if (coupon.usageLimit > 0) filter.usedCount = { $lt: coupon.usageLimit };
  const result = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } });
  if (result.modifiedCount !== 1) throw couponError(COUPON_REASONS.USAGE_LIMIT, "This coupon has reached its usage limit.");
}

export async function consumeCouponUsageForOrder(order) {
  if (!order?.couponCode || order.couponUsageConsumedAt) return false;
  if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid") return false;
  const code = normalizeCouponCode(order.couponCode);
  const filter = {
    code,
    isActive: true,
    consumedOrderIds: { $ne: order._id },
    $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
  };
  const result = await Coupon.updateOne(filter, { $inc: { usedCount: 1 }, $addToSet: { consumedOrderIds: order._id } });
  if (result.modifiedCount !== 1) {
    const existing = await Coupon.findOne({ code }).select("usageLimit usedCount consumedOrderIds");
    if (existing?.consumedOrderIds?.some((id) => id.toString() === order._id.toString())) return false;
    throw couponError(COUPON_REASONS.USAGE_LIMIT, "This coupon has reached its usage limit.");
  }
  order.couponUsageConsumedAt = new Date();
  await Order.updateOne({ _id: order._id }, { $set: { couponUsageConsumedAt: order.couponUsageConsumedAt } }).catch(() => {});
  return true;
}

export async function validateCouponPayload({ code, userId, products = [] }) {
  const requested = products.map((item) => ({ product: item.product || item.id || item._id, variant: item.variant || item.variantId, quantity: Math.max(1, Number(item.quantity) || 1) })).filter((item) => item.product);
  if (!requested.length) throw new ApiError("Add products before applying a coupon.", 400);
  const productDocs = await Product.find({ _id: { $in: requested.map((item) => item.product) }, isActive: true });
  const productMap = new Map((await priceProducts(productDocs)).map((product) => [product._id.toString(), product]));
  const items = requested.map((item) => {
    const product = productMap.get(item.product.toString());
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    const variant = item.variant ? product.variants?.find((value) => String(value._id) === String(item.variant)) : null;
    if (item.variant && !variant) throw new ApiError("Selected variant does not belong to this product.", 400);
    return { product, variant: variant?._id, quantity: item.quantity, price: (variant || product).effectivePrice };
  });
  const result = await validateCouponForItems({ code, userId, items });
  return { code: result.coupon.code, discountAmount: result.discountAmount, description: result.coupon.description || "", message: "Coupon applied successfully." };
}
