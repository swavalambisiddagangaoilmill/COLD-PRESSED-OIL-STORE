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
import { createPaymentOrder, getPaymentCheckoutStatus, processCashfreeWebhook, verifyPaymentAndCreateOrder } from "../services/paymentService.js";
import { resetShiprocketAuthForTests } from "../services/shiprocketService.js";

const original = { fetch: global.fetch, productFind: Product.find, offerFind: Offer.find, settingsFind: StoreSettings.findOne, userFind: User.findById, userUpdate: User.updateOne, checkoutCreate: PaymentCheckout.create, checkoutFind: PaymentCheckout.findOne, checkoutUpdate: PaymentCheckout.updateOne, orderFind: Order.findOne, orderFindById: Order.findById, orderFindOneAndUpdate: Order.findOneAndUpdate, orderUpdate: Order.updateOne };
const checkoutSessionId = "22222222-2222-4222-8222-222222222222";
const checkout = { _id: "checkout-id", user: "user-id", checkoutSessionId, status: "created", amount: 650, currency: "INR", cashfreeOrderId: "cf_11111111-1111-4111-8111-111111111111", orderPayload: { products: [], shippingAddress: {} } };

test.beforeEach(() => { resetShiprocketAuthForTests(); Offer.find = () => ({ lean: async () => [] }); StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) }); });
test.afterEach(() => { resetShiprocketAuthForTests(); global.fetch = original.fetch; Product.find = original.productFind; Offer.find = original.offerFind; StoreSettings.findOne = original.settingsFind; User.findById = original.userFind; User.updateOne = original.userUpdate; PaymentCheckout.create = original.checkoutCreate; PaymentCheckout.findOne = original.checkoutFind; PaymentCheckout.updateOne = original.checkoutUpdate; Order.findOne = original.orderFind; Order.findById = original.orderFindById; Order.findOneAndUpdate = original.orderFindOneAndUpdate; Order.updateOne = original.orderUpdate; });

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
  const result = await createPaymentOrder("user-id", { checkoutSessionId, order: { products: [{ product: "64b000000000000000000001", variant: "64b000000000000000000002", quantity: 1 }], shippingAddress: { phone: "9876543210", postalCode: "560001" } }, customer: {} });
  assert.equal(sent.headers["x-client-secret"], "client-secret");
  assert.equal(result.paymentSessionId, "safe-session");
  assert.equal(JSON.stringify(result).includes("client-secret"), false);
  assert.equal(stored.amount, sent.body.order_amount);
  assert.equal(stored.amount, 750);
  assert.equal(stored.orderPayload._shippingQuote.customerShippingCharge, 100);
  assert.equal(stored.razorpayQrId, sent.body.order_id);
  assert.equal(stored.idempotencyKey, sent.headers["x-idempotency-key"]);
  assert.equal(stored.checkoutSessionId, checkoutSessionId);
  assert.equal(result.checkoutSessionId, checkoutSessionId);
  assert.equal(sent.body.order_meta.return_url, `${env.clientUrl}/checkout?payment_return=${checkoutSessionId}`);
});

test("payment polling is owner-scoped and reports pending without trusting the browser", async () => {
  Object.assign(env.cashfree, { environment: "sandbox", clientId: "client-id", clientSecret: "client-secret", apiVersion: "2025-01-01" });
  let query;
  PaymentCheckout.findOne = async (value) => { query = value; return value.user === "user-id" ? checkout : null; };
  global.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/payments") ? [] : ({ order_id: checkout.cashfreeOrderId, order_amount: 650, order_currency: "INR", order_status: "ACTIVE" }) });
  const result = await getPaymentCheckoutStatus("user-id", checkout.cashfreeOrderId);
  assert.deepEqual(query, { cashfreeOrderId: checkout.cashfreeOrderId, user: "user-id" });
  assert.equal(result.status, "pending");
  await assert.rejects(() => getPaymentCheckoutStatus("other-user", checkout.cashfreeOrderId), /not found/i);
});

test("duplicate polling of a completed checkout returns the same safe order without provider calls", async () => {
  const paidCheckout = { ...checkout, status: "paid", order: "order-id" };
  const storedOrder = { _id: "order-id", paymentStatus: "paid", products: [{ title: "Oil", variantSku: "PRIVATE-SKU", shippingWeight: 1 }], shiprocketShippingCost: 98 };
  PaymentCheckout.findOne = async ({ user }) => user === "user-id" ? paidCheckout : null;
  Order.findById = async () => storedOrder;
  global.fetch = async () => { throw new Error("Provider must not be called for an already completed checkout"); };
  const first = await getPaymentCheckoutStatus("user-id", checkout.cashfreeOrderId);
  const second = await getPaymentCheckoutStatus("user-id", checkout.cashfreeOrderId);
  assert.equal(first.status, "paid");
  assert.equal(second.order._id, "order-id");
  assert.equal(second.order.products[0].variantSku, undefined);
  assert.equal(second.order.shiprocketShippingCost, undefined);
});

test("Shiprocket failure blocks Cashfree order creation with a controlled error", async () => {
  Object.assign(env.cashfree, { environment: "production", clientId: "client-id", clientSecret: "client-secret", apiVersion: "2025-01-01" });
  Object.assign(env.shiprocket, { enabled: true, email: "shiprocket@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  Product.find = async () => [{ _id: { toString: () => "64b000000000000000000001" }, title: "Oil", stock: 10, price: 650, onlinePaymentEnabled: true, variants: [{ _id: "64b000000000000000000002", size: "1L", litres: 1, price: 650, shippingWeight: 1, dimensions: { length: 10, width: 11, height: 30 }, images: [] }] }];
  let cashfreeCalled = false;
  global.fetch = async (url) => {
    if (url.includes("shiprocket.in/v1/external/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "private-token" }) };
    if (url.includes("shiprocket.in/v1/external/courier/serviceability")) return { ok: false, status: 503, text: async () => JSON.stringify({ message: "upstream unavailable" }) };
    cashfreeCalled = true;
    throw new Error("Cashfree must not be called");
  };
  await assert.rejects(
    createPaymentOrder("user-id", { checkoutSessionId, order: { products: [{ product: "64b000000000000000000001", variant: "64b000000000000000000002", quantity: 1 }], shippingAddress: { phone: "9876543210", postalCode: "560091" } }, customer: {} }),
    /Shipping charges could not be calculated\. Please try again\./,
  );
  assert.equal(cashfreeCalled, false);
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
  Order.findOneAndUpdate = async () => existingOrder;
  let cartCleanup;
  User.updateOne = async (...args) => { cartCleanup = args; return { matchedCount: 1 }; };
  Order.updateOne = async () => ({ modifiedCount: 1 });
  global.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/payments") ? [{ cf_payment_id: "payment-1", payment_status: "SUCCESS", payment_amount: 650, payment_currency: "INR" }] : ({ cf_order_id: "123", order_id: checkout.cashfreeOrderId, order_amount: 650, order_currency: "INR", order_status: "PAID" }) });
  const order = await verifyPaymentAndCreateOrder("user-id", { cashfreeOrderId: checkout.cashfreeOrderId });
  assert.equal(order._id, "existing-order");
  assert.equal(cartCleanup[0]._id, "user-id");
  assert.match(JSON.stringify(cartCleanup[1]), /\$subtract/);
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
