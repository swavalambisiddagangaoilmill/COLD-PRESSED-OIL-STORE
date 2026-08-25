import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { assertOrderStatusTransition } from "../services/orderStatusPolicy.js";
import { isValidRazorpaySignature, providerPaymentMatchesOrder } from "../services/paymentService.js";
import paymentRoutes from "../routes/paymentRoutes.js";

test("Razorpay verification accepts only a valid server-secret signature", () => {
  const secret = "test-only-server-secret";
  const orderId = "order_test_1";
  const paymentId = "pay_test_1";
  const signature = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(isValidRazorpaySignature(orderId, paymentId, signature, secret), true);
  assert.equal(isValidRazorpaySignature(orderId, paymentId, "0".repeat(64), secret), false);
});

test("provider payment must be captured and match order amount currency and id", () => {
  const valid = { order_id: "order_test_1", status: "captured", currency: "INR", amount: 170000 };
  assert.equal(providerPaymentMatchesOrder(valid, "order_test_1", 170000), true);
  assert.equal(providerPaymentMatchesOrder({ ...valid, amount: 1 }, "order_test_1", 170000), false);
  assert.equal(providerPaymentMatchesOrder({ ...valid, status: "authorized" }, "order_test_1", 170000), false);
  assert.equal(providerPaymentMatchesOrder({ ...valid, order_id: "other" }, "order_test_1", 170000), false);
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
