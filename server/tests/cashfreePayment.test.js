import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import PaymentCheckout from "../models/PaymentCheckout.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Offer from "../models/Offer.js";
import StoreSettings from "../models/StoreSettings.js";
import { createPaymentOrder, processCashfreeWebhook, verifyPaymentAndCreateOrder } from "../services/paymentService.js";

const original = { fetch: global.fetch, productFind: Product.find, offerFind: Offer.find, settingsFind: StoreSettings.findOne, userFind: User.findById, userUpdate: User.updateOne, checkoutCreate: PaymentCheckout.create, checkoutFind: PaymentCheckout.findOne, checkoutUpdate: PaymentCheckout.updateOne, orderFind: Order.findOne, orderUpdate: Order.updateOne };
const checkout = { _id: "checkout-id", user: "user-id", status: "created", amount: 650, currency: "INR", cashfreeOrderId: "cf_11111111-1111-4111-8111-111111111111", orderPayload: { products: [], shippingAddress: {} } };

test.beforeEach(() => { Offer.find = () => ({ lean: async () => [] }); StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) }); });
test.afterEach(() => { global.fetch = original.fetch; Product.find = original.productFind; Offer.find = original.offerFind; StoreSettings.findOne = original.settingsFind; User.findById = original.userFind; User.updateOne = original.userUpdate; PaymentCheckout.create = original.checkoutCreate; PaymentCheckout.findOne = original.checkoutFind; PaymentCheckout.updateOne = original.checkoutUpdate; Order.findOne = original.orderFind; Order.updateOne = original.orderUpdate; });

test("Cashfree session is created server-side and response exposes no secret", async () => {
  Object.assign(env.cashfree, { environment: "sandbox", clientId: "client-id", clientSecret: "client-secret", apiVersion: "2025-01-01" });
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  Product.find = async () => [{ _id: { toString: () => "64b000000000000000000001" }, title: "Oil", stock: 10, price: 650, onlinePaymentEnabled: true, variants: [{ _id: "64b000000000000000000002", size: "1L", litres: 1, price: 650, shippingWeight: 1.1, dimensions: { length: 10, width: 11, height: 30 }, images: [] }] }];
  User.findById = async () => ({ _id: "user-id", name: "Customer", email: "customer@example.com", phone: "9876543210" });
  let stored, sent;
  PaymentCheckout.create = async (value) => { stored = value; return value; };
  global.fetch = async (url, options) => {
    if (url.includes("shiprocket.in/v1/external/auth/login")) return { ok: true, text: async () => JSON.stringify({ token: "token" }) };
    if (url.includes("courier/serviceability")) return { ok: true, text: async () => JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 9, courier_name: "Fast", freight_charge: 98, estimated_delivery_days: 2 }] } }) };
    sent = { headers: options.headers, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ order_id: sent.body.order_id, order_amount: sent.body.order_amount, order_currency: "INR", cf_order_id: "123", payment_session_id: "safe-session" }) };
  };
  const result = await createPaymentOrder("user-id", { order: { products: [{ product: "64b000000000000000000001", variant: "64b000000000000000000002", quantity: 1 }], shippingAddress: { phone: "9876543210", postalCode: "560001" } }, customer: {} });
  assert.equal(sent.headers["x-client-secret"], "client-secret");
  assert.equal(result.paymentSessionId, "safe-session");
  assert.equal(JSON.stringify(result).includes("client-secret"), false);
  assert.equal(stored.amount, sent.body.order_amount);
  assert.equal(stored.amount, 750);
  assert.equal(stored.orderPayload._shippingQuote.customerShippingCharge, 100);
  assert.equal(stored.razorpayQrId, sent.body.order_id);
  assert.equal(stored.idempotencyKey, sent.headers["x-idempotency-key"]);
});

test("server verification rejects wrong amount and non-paid status", async () => {
  Object.assign(env.cashfree, { environment: "sandbox", clientId: "client-id", clientSecret: "client-secret", apiVersion: "2025-01-01" });
  PaymentCheckout.findOne = async () => checkout;
  global.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/payments") ? [] : ({ order_id: checkout.cashfreeOrderId, order_amount: 1, order_currency: "INR", order_status: "ACTIVE" }) });
  await assert.rejects(() => verifyPaymentAndCreateOrder("user-id", { cashfreeOrderId: checkout.cashfreeOrderId }), /amount or currency/i);
  global.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/payments") ? [] : ({ order_id: checkout.cashfreeOrderId, order_amount: 650, order_currency: "INR", order_status: "ACTIVE" }) });
  await assert.rejects(() => verifyPaymentAndCreateOrder("user-id", { cashfreeOrderId: checkout.cashfreeOrderId }), /not been completed/i);
});

test("duplicate verified payment resolves to the existing order", async () => {
  Object.assign(env.cashfree, { environment: "sandbox", clientId: "client-id", clientSecret: "client-secret", apiVersion: "2025-01-01" });
  PaymentCheckout.findOne = async () => checkout;
  PaymentCheckout.updateOne = async () => ({ modifiedCount: 1 });
  const existingOrder = { _id: "existing-order", user: "user-id", products: [{ product: "product-1" }] };
  Order.findOne = async () => existingOrder;
  let cartCleanup;
  User.updateOne = async (...args) => { cartCleanup = args; return { matchedCount: 1 }; };
  Order.updateOne = async () => ({ modifiedCount: 1 });
  global.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/payments") ? [{ cf_payment_id: "payment-1", payment_status: "SUCCESS", payment_amount: 650, payment_currency: "INR" }] : ({ cf_order_id: "123", order_id: checkout.cashfreeOrderId, order_amount: 650, order_currency: "INR", order_status: "PAID" }) });
  const order = await verifyPaymentAndCreateOrder("user-id", { cashfreeOrderId: checkout.cashfreeOrderId });
  assert.equal(order._id, "existing-order");
  assert.deepEqual(cartCleanup, [{ _id: "user-id" }, { $pull: { cart: { product: { $in: ["product-1"] } } } }]);
  assert.ok(existingOrder.cartCleanupCompletedAt instanceof Date);
});

test("Cashfree webhook rejects mismatched amount and accepts safe failed status", async () => {
  Object.assign(env.cashfree, { environment: "sandbox", clientId: "client-id", clientSecret: "client-secret", apiVersion: "2025-01-01" });
  const record = { ...checkout, save: async () => record };
  PaymentCheckout.findOne = async () => record;
  const timestamp = String(Date.now());
  const sign = (body) => crypto.createHmac("sha256", env.cashfree.clientSecret).update(timestamp + body).digest("base64");
  const bad = JSON.stringify({ data: { order: { order_id: checkout.cashfreeOrderId, order_amount: 1, order_currency: "INR" }, payment: { payment_status: "FAILED", payment_amount: 1, payment_currency: "INR" } } });
  await assert.rejects(() => processCashfreeWebhook(Buffer.from(bad), timestamp, sign(bad)), /do not match/i);
  const failed = JSON.stringify({ data: { order: { order_id: checkout.cashfreeOrderId, order_amount: 650, order_currency: "INR" }, payment: { payment_status: "FAILED", payment_amount: 650, payment_currency: "INR" } } });
  const result = await processCashfreeWebhook(Buffer.from(failed), timestamp, sign(failed));
  assert.equal(result.status, "failed");
});
