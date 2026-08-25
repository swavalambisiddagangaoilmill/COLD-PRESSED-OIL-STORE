// Payment business logic for Razorpay-compatible flows.
import crypto from "crypto";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import { createVerifiedPaymentOrder } from "./orderService.js";
import { ApiError } from "../utils/ApiError.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { calculateCheckoutTotals, consumeCouponUsageForOrder, validateCouponForItems } from "./couponService.js";
import { isServiceAvailable, logExternalFailure } from "./serviceStatusService.js";

const PAYMENT_UNAVAILABLE = "Online payments are temporarily unavailable.";

export function isValidRazorpaySignature(orderId, paymentId, signature, secret) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const received = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, received);
}

export function providerPaymentMatchesOrder(payment, orderId, amountInPaise) {
  return payment?.order_id === orderId
    && payment?.status === "captured"
    && payment?.currency === "INR"
    && Number(payment?.amount) === Number(amountInPaise);
}

async function calculateOrderAmount(productsPayload = [], userId, couponCode) {
  const productIds = productsPayload.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const items = productsPayload.map((item) => {
    const product = productMap.get(item.product.toString());
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

function assertRazorpayAvailable() {
  if (!isServiceAvailable("razorpay")) throw new ApiError(PAYMENT_UNAVAILABLE, 503);
}

function providerStatus(status) {
  return status === 429 ? 429 : 503;
}

export async function createPaymentOrder(userId, payload) {
  const amountSource = payload.order?.products || payload.products;
  const calculatedAmount = amountSource?.length ? await calculateOrderAmount(amountSource, userId, payload.order?.couponCode || payload.couponCode) : 0;
  const amount = Math.round(calculatedAmount * 100);
  if (!amount || amount < 100) throw new ApiError("Valid order products are required.", 400);
  assertRazorpayAvailable();
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64");
  let response;
  try {
    response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: payload.receipt || `receipt_${Date.now()}` }),
    });
  } catch (error) {
    logExternalFailure("razorpay", error, { action: "create_order" });
    throw new ApiError(PAYMENT_UNAVAILABLE, 503);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logExternalFailure("razorpay", new Error(data?.error?.description || data?.message || "Razorpay order creation failed."), { status: response.status, action: "create_order" });
    throw new ApiError(PAYMENT_UNAVAILABLE, providerStatus(response.status));
  }
  return { ...data, key: env.razorpay.keyId };
}

export async function verifyPaymentAndCreateOrder(userId, payload) {
  assertRazorpayAvailable();
  if (!payload.razorpayOrderId || !payload.razorpayPaymentId || !payload.razorpaySignature) {
    throw new ApiError("Complete payment verification data is required.", 400);
  }
  const existing = await Order.findOne({ razorpayPaymentId: payload.razorpayPaymentId }).lean();
  if (existing) throw new ApiError("Payment has already been processed.", 409);
  if (!isValidRazorpaySignature(payload.razorpayOrderId, payload.razorpayPaymentId, payload.razorpaySignature, env.razorpay.keySecret)) throw new ApiError("Payment verification failed.", 400);
  const amount = Math.round(await calculateOrderAmount(payload.order.products, userId, payload.order.couponCode) * 100);
  let providerResponse;
  try {
    providerResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payload.razorpayPaymentId)}`, { headers: { Authorization: razorpayAuthHeader() } });
  } catch (error) {
    logExternalFailure("razorpay", error, { action: "verify_payment" });
    throw new ApiError(PAYMENT_UNAVAILABLE, 503);
  }
  const providerPayment = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    logExternalFailure("razorpay", new Error(providerPayment?.error?.description || "Payment lookup failed."), { status: providerResponse.status, action: "verify_payment" });
    throw new ApiError(PAYMENT_UNAVAILABLE, providerStatus(providerResponse.status));
  }
  if (!providerPaymentMatchesOrder(providerPayment, payload.razorpayOrderId, amount)) throw new ApiError("Payment details do not match this order.", 400);
  const order = await createVerifiedPaymentOrder(userId, payload.order, { razorpayOrderId: payload.razorpayOrderId, razorpayPaymentId: payload.razorpayPaymentId, razorpaySignature: payload.razorpaySignature });
  await Promise.allSettled([createAdminNotification({ category: "payments", type: "payment_successful", title: "Payment Successful", description: `Payment received for order ${order._id}.`, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/payments" } })]);
  return order;
}

function razorpayAuthHeader() {
  return `Basic ${Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64")}`;
}

function normalizeRazorpayError(payload, status) {
  const message = payload?.error?.description || payload?.error?.reason || payload?.error?.code || payload?.message || "Unable to create Razorpay UPI QR.";
  if (status === 404 || /requested url was not found/i.test(message)) {
    return `Razorpay UPI QR is not available for this account or key mode. Razorpay returned: ${message}. Please enable the QR Codes / upi_qr feature for this Razorpay account. Standard Checkout remains available.`;
  }
  return message;
}

export async function createUpiQrCheckout(userId, payload) {
  assertRazorpayAvailable();
  const amount = Math.round(await calculateOrderAmount(payload.order?.products || [], userId, payload.order?.couponCode) * 100);
  if (!amount || amount < 100) throw new ApiError("Valid order products are required.", 400);
  const closeBy = Math.ceil((Date.now() + 15 * 60 * 1000) / 1000);
  let response;
  try {
    response = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
      method: "POST",
      headers: { Authorization: razorpayAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "upi_qr",
        name: `Swavalambi Siddaganga Oil Mill checkout ${Date.now()}`,
        usage: "single_use",
        fixed_amount: true,
        payment_amount: amount,
        description: "Swavalambi Siddaganga Oil Mill UPI QR checkout",
        close_by: closeBy,
        notes: { userId: String(userId) },
      }),
    });
  } catch (error) {
    logExternalFailure("razorpay", error, { action: "create_upi_qr" });
    throw new ApiError(PAYMENT_UNAVAILABLE, 503);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = normalizeRazorpayError(data, response.status);
    logExternalFailure("razorpay", new Error(message), { status: response.status, action: "create_upi_qr" });
    throw new ApiError(response.status === 404 || response.status === 400 ? message : PAYMENT_UNAVAILABLE, response.status === 404 || response.status === 400 ? 400 : providerStatus(response.status));
  }
  const checkout = await PaymentCheckout.create({
    user: userId,
    type: "upi_qr",
    amount,
    currency: data.currency || "INR",
    razorpayQrId: data.id,
    imageUrl: data.image_url,
    orderPayload: payload.order,
    expiresAt: new Date(closeBy * 1000),
  });
  return { id: checkout._id, qrId: checkout.razorpayQrId, imageUrl: checkout.imageUrl, amount: checkout.amount, currency: checkout.currency, expiresAt: checkout.expiresAt };
}

async function fetchQrPayments(qrId) {
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${qrId}/payments`, { headers: { Authorization: razorpayAuthHeader() } });
  } catch (error) {
    logExternalFailure("razorpay", error, { action: "verify_upi_qr" });
    throw new ApiError(PAYMENT_UNAVAILABLE, 503);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = normalizeRazorpayError(data, response.status) || "Unable to verify QR payment.";
    logExternalFailure("razorpay", new Error(message), { status: response.status, action: "verify_upi_qr" });
    throw new ApiError(response.status === 404 || response.status === 400 ? message : PAYMENT_UNAVAILABLE, response.status === 404 || response.status === 400 ? 400 : providerStatus(response.status));
  }
  return data.items || [];
}

export async function verifyUpiQrCheckout(userId, checkoutId) {
  const checkout = await PaymentCheckout.findOne({ _id: checkoutId, user: userId });
  if (!checkout) throw new ApiError("QR checkout not found.", 404);
  if (checkout.status === "paid") {
    const order = await Order.findById(checkout.order);
    return { status: "paid", order, checkout };
  }
  if (checkout.expiresAt <= new Date()) {
    checkout.status = "expired";
    await checkout.save();
    return { status: "expired", checkout };
  }
  const payments = await fetchQrPayments(checkout.razorpayQrId);
  const captured = payments.find((payment) => payment.status === "captured" && Number(payment.amount) === checkout.amount);
  if (!captured) return { status: "created", checkout };
  const existing = await PaymentCheckout.findOne({ razorpayPaymentId: captured.id, status: "paid" });
  if (existing?.order) {
    checkout.status = "paid";
    checkout.razorpayPaymentId = captured.id;
    checkout.order = existing.order;
    await checkout.save();
    const order = await Order.findById(existing.order);
    return { status: "paid", order, checkout };
  }
  const order = await createVerifiedPaymentOrder(userId, checkout.orderPayload, { razorpayPaymentId: captured.id });
  checkout.status = "paid";
  checkout.razorpayPaymentId = captured.id;
  checkout.order = order._id;
  await checkout.save();
  return { status: "paid", order, checkout };
}

export async function processRazorpayWebhook(rawBody, signature) {
  assertRazorpayAvailable();
  if (!env.razorpay.webhookSecret) throw new ApiError("Razorpay webhook secret is not configured.", 503);
  if (!signature) throw new ApiError("Razorpay webhook signature is required.", 400);
  const expected = crypto.createHmac("sha256", env.razorpay.webhookSecret).update(rawBody).digest("hex");
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, received)) throw new ApiError("Invalid Razorpay webhook signature.", 400);
  const event = JSON.parse(rawBody.toString("utf8"));
  const payment = event.payload?.payment?.entity;
  if (!payment?.id) return { processed: false, event: event.event };
  if (event.event === "payment.failed") {
    await createAdminNotification({ category: "payments", type: "payment_failed", title: "Payment Failed", description: `Razorpay payment ${payment.id} failed.`, related: { kind: "Payment", id: payment.id, label: payment.id, path: "/admin/payments" } });
    return { processed: true, status: "failed" };
  }
  if (!["payment.captured", "payment.authorized"].includes(event.event)) return { processed: false, event: event.event };
  const existingOrder = await Order.findOne({ $or: [{ razorpayPaymentId: payment.id }, { razorpayOrderId: payment.order_id }] });
  if (existingOrder) {
    const expectedAmount = Math.round(Number(existingOrder.totalAmount) * 100);
    if (payment.currency !== "INR" || Number(payment.amount) !== expectedAmount || (existingOrder.razorpayOrderId && payment.order_id !== existingOrder.razorpayOrderId)) {
      throw new ApiError("Webhook payment details do not match the order.", 400);
    }
    existingOrder.paymentStatus = payment.status === "captured" ? "paid" : existingOrder.paymentStatus;
    existingOrder.razorpayPaymentId = existingOrder.razorpayPaymentId || payment.id;
    await existingOrder.save();
    await consumeCouponUsageForOrder(existingOrder);
    return { processed: true, order: existingOrder, status: existingOrder.paymentStatus };
  }
  const checkout = await PaymentCheckout.findOne({ $or: [{ razorpayPaymentId: payment.id }, { razorpayQrId: payment.qr_code_id }] });
  if (checkout?.orderPayload && checkout.status !== "paid" && Number(payment.amount) === checkout.amount && payment.status === "captured") {
    const order = await createVerifiedPaymentOrder(checkout.user, checkout.orderPayload, { razorpayPaymentId: payment.id, razorpayOrderId: payment.order_id });
    checkout.status = "paid";
    checkout.razorpayPaymentId = payment.id;
    checkout.order = order._id;
    await checkout.save();
    return { processed: true, order, status: "paid" };
  }
  return { processed: true, status: payment.status };
}
