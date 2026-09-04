import crypto from "crypto";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { calculateCheckoutTotals, validateCouponForItems } from "./couponService.js";
import { createOrder as createStoreOrder, ensureOrderCartCleanup } from "./orderService.js";
import { priceProducts } from "./offerPricingService.js";
import { requiredStockLitres } from "./variantInventoryService.js";
import { calculateShippingQuote } from "./shippingQuoteService.js";

const UNAVAILABLE = "Online payments are temporarily unavailable.";
const CURRENCY = "INR";
const baseUrl = () => env.cashfree.environment === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

function configured() {
  if (!env.cashfree.clientId || !env.cashfree.clientSecret || !env.cashfree.apiVersion) throw new ApiError(UNAVAILABLE, 503);
}

async function request(path, options = {}) {
  configured();
  let response;
  try {
    response = await fetch(`${baseUrl()}${path}`, { ...options, headers: { "Content-Type": "application/json", "x-client-id": env.cashfree.clientId, "x-client-secret": env.cashfree.clientSecret, "x-api-version": env.cashfree.apiVersion, ...options.headers } });
  } catch { throw new ApiError(UNAVAILABLE, 503); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status === 429 ? "Payment service is busy. Please retry shortly." : UNAVAILABLE, response.status === 429 ? 429 : 503);
  return data;
}

async function calculateAmount(productsPayload, userId, couponCode, paymentMethod = "cashfree") {
  const products = await Product.find({ _id: { $in: productsPayload.map((item) => item.product) }, isActive: true });
  const pricedProducts = await priceProducts(products);
  const byId = new Map(pricedProducts.map((product) => [product._id.toString(), product]));
  const items = productsPayload.map((item) => {
    const product = byId.get(item.product.toString());
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const variant = item.variant ? product.variants?.find((value) => String(value._id) === String(item.variant)) : null;
    if (item.variant && !variant) throw new ApiError("Selected variant does not belong to this product.", 400);
    if (variant?.isActive === false) throw new ApiError(`${product.title} (${variant.size}) is unavailable.`, 400);
    if (product.stock < (variant ? requiredStockLitres(variant, quantity) : quantity)) throw new ApiError(`${product.title}${variant ? ` · ${variant.size}` : ""} is no longer available in the requested quantity.`, 400);
    if (paymentMethod === "cod" && product.codEnabled === false) throw new ApiError(`${product.title} is not eligible for Cash on delivery.`, 400);
    if (paymentMethod !== "cod" && product.onlinePaymentEnabled === false) throw new ApiError(`${product.title} is not eligible for online payment.`, 400);
    return { product, variant: variant?._id, quantity, price: (variant || product).effectivePrice, litreSize: variant ? Number(variant.litres) : 1 };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coupon = await validateCouponForItems({ code: couponCode, userId, items, subtotal });
  return { items, couponDiscount: coupon.discountAmount, subtotal, };
}

export async function getCheckoutShippingQuote(userId, payload) {
  const priced = await calculateAmount(payload.products || [], userId, payload.couponCode, payload.paymentMethod);
  const quote = await calculateShippingQuote({ items: priced.items, deliveryPincode: payload.deliveryPincode, paymentMethod: payload.paymentMethod, declaredValue: Math.max(0, priced.subtotal - priced.couponDiscount) });
  const totals = calculateCheckoutTotals(priced.items, priced.couponDiscount, quote.customerShippingCharge);
  return { shippingAmount: quote.customerShippingCharge, subtotal: totals.subtotal, couponDiscount: totals.discountAmount, totalAmount: totals.totalAmount };
}

export async function createPaymentOrder(userId, payload) {
  const orderPayload = payload.order || {};
  const priced = await calculateAmount(orderPayload.products || [], userId, orderPayload.couponCode);
  const shippingQuote = await calculateShippingQuote({ items: priced.items, deliveryPincode: orderPayload.shippingAddress?.postalCode, paymentMethod: "cashfree", declaredValue: Math.max(0, priced.subtotal - priced.couponDiscount) });
  const amount = Number(calculateCheckoutTotals(priced.items, priced.couponDiscount, shippingQuote.customerShippingCharge).totalAmount.toFixed(2));
  if (amount < 1) throw new ApiError("Valid order products are required.", 400);
  const user = await User.findById(userId);
  if (!user) throw new ApiError("Customer account not found.", 404);
  const phone = String(payload.customer?.phone || user.phone || orderPayload.shippingAddress?.phone || "").replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) throw new ApiError("A valid customer phone is required for online payment.", 400);
  const orderId = `cf_${crypto.randomUUID()}`;
  const idempotencyKey = crypto.randomUUID();
  const provider = await request("/orders", { method: "POST", headers: { "x-idempotency-key": idempotencyKey, "x-request-id": idempotencyKey }, body: JSON.stringify({ order_id: orderId, order_amount: amount, order_currency: CURRENCY, customer_details: { customer_id: String(user._id), customer_name: String(payload.customer?.name || user.name || "Customer").slice(0, 100), customer_email: String(payload.customer?.email || user.email || "").slice(0, 100), customer_phone: phone }, order_meta: { return_url: `${env.clientUrl}/checkout?cashfree_order_id=${encodeURIComponent(orderId)}`, notify_url: `${env.backendPublicUrl}/api/payments/webhook` }, order_note: "Swavalambi Siddaganga Oil Mill order" }) });
  if (provider.order_id !== orderId || Number(provider.order_amount) !== amount || provider.order_currency !== CURRENCY || !provider.payment_session_id) throw new ApiError("Payment provider returned an invalid order.", 502);
  await PaymentCheckout.create({ user: userId, amount, currency: CURRENCY, cashfreeOrderId: orderId, cashfreeCfOrderId: provider.cf_order_id, paymentSessionId: provider.payment_session_id, razorpayQrId: orderId, idempotencyKey, orderPayload: { ...orderPayload, _shippingQuote: shippingQuote }, expiresAt: provider.order_expiry_time ? new Date(provider.order_expiry_time) : undefined });
  return { orderId, paymentSessionId: provider.payment_session_id, environment: env.cashfree.environment === "production" ? "production" : "sandbox" };
}

async function verifyProvider(checkout) {
  const [order, payments] = await Promise.all([request(`/orders/${encodeURIComponent(checkout.cashfreeOrderId)}`), request(`/orders/${encodeURIComponent(checkout.cashfreeOrderId)}/payments`)]);
  if (order.order_id !== checkout.cashfreeOrderId) throw new ApiError("Payment order verification failed.", 400);
  if (Number(order.order_amount) !== Number(checkout.amount) || order.order_currency !== checkout.currency) throw new ApiError("Payment amount or currency verification failed.", 400);
  if (order.order_status !== "PAID") throw new ApiError("Payment has not been completed.", 409);
  const payment = (Array.isArray(payments) ? payments : []).find((item) => item.payment_status === "SUCCESS" && Number(item.payment_amount) === Number(checkout.amount) && item.payment_currency === checkout.currency);
  if (!payment?.cf_payment_id) throw new ApiError("Successful payment could not be verified.", 400);
  return { order, payment };
}

async function finalize(checkout) {
  if (checkout.status === "paid" && checkout.order) return Order.findById(checkout.order);
  const verified = await verifyProvider(checkout);
  const paymentId = String(verified.payment.cf_payment_id);
  const duplicate = await Order.findOne({ $or: [{ cashfreePaymentId: paymentId }, { cashfreeOrderId: checkout.cashfreeOrderId }] });
  if (duplicate) {
    await ensureOrderCartCleanup(duplicate);
    await PaymentCheckout.updateOne({ _id: checkout._id }, { status: "paid", cashfreePaymentId: paymentId, order: duplicate._id });
    return duplicate;
  }
  const claimed = await PaymentCheckout.findOneAndUpdate({ _id: checkout._id, status: { $in: ["created", "failed"] } }, { status: "processing" }, { new: true });
  if (!claimed) {
    const current = await PaymentCheckout.findById(checkout._id);
    if (current?.status === "paid" && current.order) return Order.findById(current.order);
    throw new ApiError("Payment is already being processed.", 409);
  }
  try {
    const { _shippingQuote, ...orderPayload } = checkout.orderPayload;
    const order = await createStoreOrder(checkout.user, { ...orderPayload, paymentMethod: "cashfree", paymentStatus: "paid", cashfreeOrderId: checkout.cashfreeOrderId, cashfreeCfOrderId: verified.order.cf_order_id, cashfreePaymentId: paymentId }, { trustedShippingQuote: _shippingQuote });
    await PaymentCheckout.updateOne({ _id: claimed._id }, { status: "paid", cashfreePaymentId: paymentId, order: order._id });
    await Promise.allSettled([createAdminNotification({ category: "payments", type: "payment_successful", title: "Payment Successful", description: `Payment received for order ${order._id}.`, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/payments" } })]);
    return order;
  } catch (error) {
    await PaymentCheckout.updateOne({ _id: claimed._id, status: "processing" }, { status: "created" });
    throw error;
  }
}

export async function verifyPaymentAndCreateOrder(userId, payload) {
  const checkout = await PaymentCheckout.findOne({ cashfreeOrderId: payload.cashfreeOrderId, user: userId });
  if (!checkout) throw new ApiError("Payment order not found.", 404);
  return finalize(checkout);
}

export async function processCashfreeWebhook(rawBody, timestamp, signature) {
  configured();
  if (!timestamp || !signature || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() - Number(timestamp)) > 300000) throw new ApiError("Cashfree webhook signature is invalid.", 400);
  const expected = crypto.createHmac("sha256", env.cashfree.clientSecret).update(`${timestamp}${rawBody.toString("utf8")}`).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ApiError("Invalid Cashfree webhook signature.", 400);
  const event = JSON.parse(rawBody.toString("utf8"));
  const providerOrder = event.data?.order, payment = event.data?.payment;
  if (!providerOrder?.order_id || !payment?.payment_status) return { processed: false };
  const checkout = await PaymentCheckout.findOne({ cashfreeOrderId: providerOrder.order_id });
  if (!checkout) return { processed: false };
  if (Number(providerOrder.order_amount) !== Number(checkout.amount) || providerOrder.order_currency !== checkout.currency || Number(payment.payment_amount) !== Number(checkout.amount) || payment.payment_currency !== checkout.currency) throw new ApiError("Webhook payment details do not match the order.", 400);
  if (payment.payment_status === "SUCCESS") {
    const order = await finalize(checkout);
    return { processed: true, orderId: order._id, status: "paid" };
  }
  if (["FAILED", "USER_DROPPED", "CANCELLED"].includes(payment.payment_status) && checkout.status !== "paid") {
    checkout.status = payment.payment_status === "FAILED" ? "failed" : "cancelled";
    await checkout.save();
    await Promise.allSettled([createAdminNotification({ category: "payments", type: "payment_failed", title: "Payment Failed", description: `Cashfree payment for ${checkout.cashfreeOrderId} was not completed.`, related: { kind: "Payment", id: checkout.cashfreeOrderId, label: checkout.cashfreeOrderId, path: "/admin/payments" } })]);
    return { processed: true, status: checkout.status };
  }
  return { processed: false, status: payment.payment_status };
}
