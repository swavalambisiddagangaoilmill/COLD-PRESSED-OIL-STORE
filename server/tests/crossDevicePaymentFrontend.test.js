import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("original checkout device polls an authenticated backend status and survives refresh", () => {
  const checkout = fs.readFileSync(path.join(root, "src/components/features/cart/CheckoutForm.jsx"), "utf8");
  const service = fs.readFileSync(path.join(root, "src/services/checkoutService.js"), "utf8");
  assert.match(checkout, /pollPaymentStatus\(payment\.orderId,/);
  assert.match(checkout, /writePendingPayment\(/);
  assert.match(checkout, /resumablePendingPayment\(location\.search\)/);
  assert.match(service, /API_ENDPOINTS\.paymentStatus/);
  assert.doesNotMatch(checkout, /cashfree_order_id/);
});

test("same-device provider return resumes the existing authoritative checkout verification", () => {
  const payment = fs.readFileSync(path.join(root, "server/services/paymentService.js"), "utf8");
  const checkout = fs.readFileSync(path.join(root, "src/components/features/cart/CheckoutForm.jsx"), "utf8");
  assert.match(payment, /\/checkout\?payment_return=\$\{encodeURIComponent\(checkoutSessionId\)\}/);
  assert.match(checkout, /getPaymentStatus\(cashfreeOrderId\)/);
  assert.match(checkout, /result\.status === "paid" && result\.order/);
  assert.doesNotMatch(checkout, /cashfree_order_id/);
});

test("confirmed order snapshot survives a safe success-page refresh", () => {
  const checkout = fs.readFileSync(path.join(root, "src/components/features/cart/CheckoutForm.jsx"), "utf8");
  const success = fs.readFileSync(path.join(root, "src/pages/OrderSuccess.jsx"), "utf8");
  assert.match(checkout, /writeConfirmedOrder\(checkoutSessionIdRef\.current/);
  assert.match(success, /confirmedOrderForSession\(checkoutSessionId\)/);
});
