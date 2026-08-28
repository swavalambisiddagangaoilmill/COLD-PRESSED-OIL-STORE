// Cashfree payment creation, server verification, and idempotent reconciliation.
import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { calculateCheckoutTotals, validateCouponForItems } from "./couponService.js";
import { createVerifiedPaymentOrder } from "./orderService.js";
import { isServiceAvailable, logExternalFailure } from "./serviceStatusService.js";

const PAYMENT_UNAVAILABLE = "Online payments are temporarily unavailable.";
const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED", "USER_DROPPED", "VOID"]);

function assertCashfreeAvailable() {
  if (!isServiceAvailable("cashfree")) throw new ApiError(PAYMENT_UNAVAILABLE, 503);
}

function cashfreeHeaders(extra = {}) {
  return { "Content-Type": "application/json", "x-api-version": env.cashfree.apiVersion, "x-client-id": env.cashfree.clientId, "x-client-secret": env.cashfree.clientSecret, ...extra };
}

async function cashfreeRequest(path, options = {}, retries = 0) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${env.cashfree.baseUrl}${path}`, { ...options, headers: cashfreeHeaders(options.headers), signal: AbortSignal.timeout(10_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.message || data?.type || "Cashfree request failed.");
        error.status = response.status;
        if (attempt < retries && (response.status === 429 || response.status >= 500)) { lastError = error; continue; }
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || (error.status && error.status < 500 && error.status !== 429)) break;
    }
  }
  logExternalFailure("cashfree", lastError, { action: options.method || "GET", path });
  throw new ApiError(PAYMENT_UNAVAILABLE, lastError?.status === 429 ? 429 : 503);
}

async function calculateOrderAmount(productsPayload = [], userId, couponCode) {
  const productIds = productsPayload.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const items = productsPayload.map((item) => {
    const product = productMap.get(String(item.product));
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const variant = product.variants?.id(item.variantId || item.variant);
    if (!variant || !variant.isActive || variant.isArchived) throw new ApiError(`${product.title} variant is unavailable.`, 400);
    if (variant.stock < quantity) throw new ApiError(`${product.title} ${variant.name} does not have enough stock.`, 400);
    if (product.onlinePaymentEnabled === false) throw new ApiError(`${product.title} is not eligible for online payment.`, 400);
    return { product, variant, quantity, price: variant.price };
  });
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const coupon = await validateCouponForItems({ code: couponCode, userId, items, subtotal });
  return calculateCheckoutTotals(items, coupon.discountAmount).totalAmount;
}

function safeOrderPayload(order) {
  return {
    products: order.products.map((item) => ({ product: item.product, variantId: item.variantId, quantity: item.quantity })),
    shippingAddress: {
      fullName: order.shippingAddress.fullName, phone: order.shippingAddress.phone, street: order.shippingAddress.street,
      city: order.shippingAddress.city, state: order.shippingAddress.state, postalCode: order.shippingAddress.postalCode,
      country: order.shippingAddress.country || "India",
    },
    couponCode: order.couponCode,
  };
}

export function isValidCashfreeWebhookSignature(rawBody, timestamp, signature, secret = env.cashfree.clientSecret) {
  if (!rawBody || !timestamp || !signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}${rawBody.toString("utf8")}`).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function cashfreePaymentMatchesCheckout(providerOrder, payment, checkout) {
  return providerOrder?.order_id === checkout.cashfreeOrderId && providerOrder?.order_status === "PAID"
    && Number(providerOrder?.order_amount) === Number(checkout.amount) && providerOrder?.order_currency === checkout.currency
    && payment?.order_id === checkout.cashfreeOrderId && payment?.payment_status === "SUCCESS"
    && Number(payment?.payment_amount) === Number(checkout.amount) && payment?.payment_currency === checkout.currency;
}

export async function createPaymentOrder(userId, payload) {
  assertCashfreeAvailable();
  const orderPayload = safeOrderPayload(payload.order);
  const amount = await calculateOrderAmount(orderPayload.products, userId, orderPayload.couponCode);
  if (!amount || amount < 1) throw new ApiError("Valid order products are required.", 400);
  const user = await User.findById(userId).select("name email phone").lean();
  if (!user) throw new ApiError("Customer account not found.", 404);
  const checkoutId = new mongoose.Types.ObjectId();
  const cashfreeOrderId = `order_${checkoutId}`;
  const idempotencyKey = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const checkout = await PaymentCheckout.create({ _id: checkoutId, user: userId, amount, currency: "INR", cashfreeOrderId, idempotencyKey, orderPayload, expiresAt });
  try {
    const providerOrder = await cashfreeRequest("/orders", {
      method: "POST",
      headers: { "x-idempotency-key": idempotencyKey, "x-request-id": crypto.randomUUID() },
      body: JSON.stringify({
        order_id: cashfreeOrderId, order_amount: amount, order_currency: "INR",
        customer_details: { customer_id: String(userId), customer_name: user.name || orderPayload.shippingAddress.fullName, customer_email: user.email || undefined, customer_phone: orderPayload.shippingAddress.phone || user.phone },
        order_meta: { return_url: `${env.clientUrl}/checkout?cashfree_order_id={order_id}`, notify_url: env.backendPublicUrl ? `${env.backendPublicUrl.replace(/\/$/, "")}/api/payments/webhook` : undefined },
        order_note: `Checkout ${checkoutId}`,
      }),
    });
    if (!providerOrder.payment_session_id) throw new Error("Cashfree response did not include a payment session.");
    checkout.cfOrderId = String(providerOrder.cf_order_id || "");
    checkout.paymentSessionId = providerOrder.payment_session_id;
    await checkout.save();
    return { checkoutId: checkout.id, paymentSessionId: providerOrder.payment_session_id, environment: env.cashfree.environment, expiresAt };
  } catch (error) {
    checkout.status = "failed";
    await checkout.save().catch(() => undefined);
    throw error;
  }
}

async function verifyProviderPayment(checkout) {
  const encoded = encodeURIComponent(checkout.cashfreeOrderId);
  const [providerOrder, payments] = await Promise.all([cashfreeRequest(`/orders/${encoded}`, {}, 2), cashfreeRequest(`/orders/${encoded}/payments`, {}, 2)]);
  const payment = (Array.isArray(payments) ? payments : []).find((item) => item.payment_status === "SUCCESS");
  return { providerOrder, payment };
}

async function finalizeCheckout(checkout) {
  if (checkout.status === "paid" && checkout.order) return { order: await Order.findById(checkout.order), status: "paid" };
  const { providerOrder, payment } = await verifyProviderPayment(checkout);
  if (!cashfreePaymentMatchesCheckout(providerOrder, payment, checkout)) {
    const latestStatus = payment?.payment_status || providerOrder?.order_status;
    if (TERMINAL_FAILURES.has(latestStatus)) await PaymentCheckout.updateOne({ _id: checkout._id, status: { $ne: "paid" } }, { $set: { status: latestStatus === "USER_DROPPED" ? "cancelled" : "failed" } });
    return { order: null, status: latestStatus === "USER_DROPPED" ? "cancelled" : "pending" };
  }
  const paymentId = String(payment.cf_payment_id);
  const existingOrder = await Order.findOne({ $or: [{ cfPaymentId: paymentId }, { cashfreeOrderId: checkout.cashfreeOrderId }] });
  if (existingOrder) {
    await PaymentCheckout.updateOne({ _id: checkout._id }, { $set: { status: "paid", order: existingOrder._id, cfPaymentId: paymentId } });
    return { order: existingOrder, status: "paid" };
  }
  const claimed = await PaymentCheckout.findOneAndUpdate({ _id: checkout._id, status: { $in: ["created", "failed", "cancelled", "expired"] } }, { $set: { status: "processing", cfPaymentId: paymentId } }, { new: true });
  if (!claimed) {
    const current = await PaymentCheckout.findById(checkout._id);
    if (current?.status === "paid" && current.order) return { order: await Order.findById(current.order), status: "paid" };
    return { order: null, status: "processing" };
  }
  try {
    const order = await createVerifiedPaymentOrder(claimed.user, claimed.orderPayload, { cashfreeOrderId: claimed.cashfreeOrderId, cfPaymentId: paymentId });
    claimed.status = "paid";
    claimed.order = order._id;
    await claimed.save();
    await Promise.allSettled([createAdminNotification({ category: "payments", type: "payment_successful", title: "Payment Successful", description: `Payment received for order ${order._id}.`, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/payments" } })]);
    return { order, status: "paid" };
  } catch (error) {
    claimed.status = "created";
    await claimed.save().catch(() => undefined);
    if (error?.code === 11000) {
      const order = await Order.findOne({ $or: [{ cfPaymentId: paymentId }, { cashfreeOrderId: claimed.cashfreeOrderId }] });
      if (order) return { order, status: "paid" };
    }
    throw error;
  }
}

export async function verifyPaymentAndCreateOrder(userId, checkoutId) {
  assertCashfreeAvailable();
  const checkout = await PaymentCheckout.findOne({ _id: checkoutId, user: userId }).select("+paymentSessionId +idempotencyKey");
  if (!checkout) throw new ApiError("Payment checkout not found.", 404);
  return finalizeCheckout(checkout);
}

export async function processCashfreeWebhook(rawBody, headers) {
  assertCashfreeAvailable();
  if (!headers["x-webhook-version"] || !isValidCashfreeWebhookSignature(rawBody, headers["x-webhook-timestamp"], headers["x-webhook-signature"])) throw new ApiError("Invalid Cashfree webhook signature.", 401);
  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); } catch { throw new ApiError("Invalid webhook payload.", 400); }
  const cashfreeOrderId = event?.data?.order?.order_id;
  if (!cashfreeOrderId) return { processed: false };
  const checkout = await PaymentCheckout.findOne({ cashfreeOrderId }).select("+paymentSessionId +idempotencyKey");
  if (!checkout) return { processed: false };
  const paymentStatus = event?.data?.payment?.payment_status;
  if (paymentStatus === "SUCCESS") {
    const result = await finalizeCheckout(checkout);
    return { processed: true, status: result.status };
  }
  if (TERMINAL_FAILURES.has(paymentStatus) && checkout.status !== "paid") {
    checkout.status = paymentStatus === "USER_DROPPED" ? "cancelled" : "failed";
    await checkout.save();
  }
  return { processed: true, status: checkout.status };
}
