import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { assertOrderStatusTransition } from "../services/orderStatusPolicy.js";
import { cashfreePaymentMatchesCheckout, isValidCashfreeWebhookSignature } from "../services/paymentService.js";
import paymentRoutes from "../routes/paymentRoutes.js";

test("Cashfree webhook verification accepts only a valid raw-body signature", () => {
  const secret = "test-only-server-secret";
  const timestamp = "1746427759733";
  const rawBody = Buffer.from('{"data":{"payment":{"payment_amount":170.00}}}');
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("base64");
  assert.equal(isValidCashfreeWebhookSignature(rawBody, timestamp, signature, secret), true);
  assert.equal(isValidCashfreeWebhookSignature(rawBody, timestamp, Buffer.alloc(32).toString("base64"), secret), false);
});

test("Cashfree payment must be successful and match order amount currency and id", () => {
  const checkout = { cashfreeOrderId: "order_test_1", amount: 1700, currency: "INR" };
  const order = { order_id: "order_test_1", order_status: "PAID", order_amount: 1700, order_currency: "INR" };
  const payment = { order_id: "order_test_1", payment_status: "SUCCESS", payment_amount: 1700, payment_currency: "INR" };
  assert.equal(cashfreePaymentMatchesCheckout(order, payment, checkout), true);
  assert.equal(cashfreePaymentMatchesCheckout(order, { ...payment, payment_amount: 1 }, checkout), false);
  assert.equal(cashfreePaymentMatchesCheckout(order, { ...payment, payment_status: "PENDING" }, checkout), false);
  assert.equal(cashfreePaymentMatchesCheckout({ ...order, order_id: "other" }, payment, checkout), false);
});

test("customer payment router exposes no browser endpoint that marks an order paid", () => {
  const routes = paymentRoutes.stack.map((layer) => `${Object.keys(layer.route?.methods || {}).join(",")}:${layer.route?.path || ""}`);
  assert.equal(routes.some((route) => route.includes("/orders/:orderId/status")), false);
  assert.equal(routes.some((route) => route.includes("post:/verify")), true);
});

test("order lifecycle permits only defined adjacent transitions", () => {
  assert.equal(assertOrderStatusTransition("placed", "confirmed"), "confirmed");
  assert.equal(assertOrderStatusTransition("confirmed", "packed"), "packed");
  assert.equal(assertOrderStatusTransition("packed", "shipped"), "shipped");
  assert.equal(assertOrderStatusTransition("shipped", "delivered"), "delivered");
  assert.throws(() => assertOrderStatusTransition("placed", "delivered"), /Invalid order status transition/);
  assert.throws(() => assertOrderStatusTransition("delivered", "placed"), /Invalid order status transition/);
  assert.throws(() => assertOrderStatusTransition("cancelled", "confirmed"), /Invalid order status transition/);
});
