// Coupon validation shared by storefront checkout and order creation.
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";

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

export function calculateCheckoutTotals(items = [], couponDiscount = 0) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const shippingAmount = subtotal > 999 || subtotal === 0 ? 0 : 80;
  const taxAmount = Math.round(subtotal * 0.05);
  const discountAmount = Math.max(0, Math.min(subtotal, Math.round(Number(couponDiscount) || 0)));
  return { subtotal, shippingAmount, taxAmount, discountAmount, totalAmount: Math.max(0, subtotal + shippingAmount + taxAmount - discountAmount) };
}

export function assertCouponEligibility(coupon, now = new Date()) {
  if (!coupon) throw new ApiError("Coupon code was not found.", 400);
  if (!coupon.isActive) throw new ApiError("Coupon is inactive.", 400);
  const bounds = couponDateBounds(coupon);
  if (!bounds.start || !bounds.expiry) throw new ApiError("Coupon dates are invalid.", 400);
  if (now < bounds.start) throw new ApiError("Coupon is not active yet.", 400);
  if (now > bounds.expiry) throw new ApiError("Coupon has expired.", 400);
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw new ApiError("Coupon usage limit has been reached.", 400);
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
  if (orderSubtotal < coupon.minimumOrderAmount) throw new ApiError(`Minimum order for this coupon is Rs. ${coupon.minimumOrderAmount}.`, 400);

  if (coupon.firstOrderOnly && userId) {
    const existingOrders = await Order.countDocuments({ user: userId });
    if (existingOrders > 0) throw new ApiError("This coupon is valid only on the first order.", 400);
  }
  if (coupon.perCustomerUsageLimit > 0 && userId) {
    const customerUses = await Order.countDocuments({ user: userId, couponCode });
    if (customerUses >= coupon.perCustomerUsageLimit) throw new ApiError("You have already used this coupon the maximum number of times.", 400);
  }

  const productIds = new Set((coupon.products || []).map((id) => id.toString()));
  const categoryIds = new Set((coupon.categories || []).map((id) => id.toString()));
  const eligibleItems = items.filter((item) => {
    if (coupon.scope === "PRODUCTS") return productIds.has(itemProductId(item));
    if (coupon.scope === "CATEGORY") return categoryIds.has(itemCategoryId(item));
    return true;
  });
  if (!eligibleItems.length) throw new ApiError("Coupon does not apply to the selected products.", 400);

  const discountBase = eligibleItems.reduce((sum, item) => sum + lineTotal(item), 0);
  return { coupon, discountAmount: calculateCouponDiscount(coupon, discountBase, orderSubtotal) };
}

export async function consumeCouponUsage(coupon) {
  if (!coupon) return;
  const filter = { _id: coupon._id, isActive: true };
  if (coupon.usageLimit > 0) filter.usedCount = { $lt: coupon.usageLimit };
  const result = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } });
  if (result.modifiedCount !== 1) throw new ApiError("Coupon usage limit has been reached.", 400);
}

export async function validateCouponPayload({ code, userId, products = [] }) {
  const requested = products.map((item) => ({ product: item.product || item.id || item._id, quantity: Math.max(1, Number(item.quantity) || 1) })).filter((item) => item.product);
  if (!requested.length) throw new ApiError("Add products before applying a coupon.", 400);
  const productDocs = await Product.find({ _id: { $in: requested.map((item) => item.product) }, isActive: true });
  const productMap = new Map(productDocs.map((product) => [product._id.toString(), product]));
  const items = requested.map((item) => {
    const product = productMap.get(item.product.toString());
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    return { product, quantity: item.quantity, price: product.discountPrice || product.price };
  });
  const result = await validateCouponForItems({ code, userId, items });
  return { code: result.coupon.code, discountAmount: result.discountAmount, description: result.coupon.description || "Coupon applied successfully." };
}
