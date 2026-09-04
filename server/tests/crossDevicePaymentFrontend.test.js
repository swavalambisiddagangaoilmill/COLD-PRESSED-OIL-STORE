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
  assert.match(checkout, /sessionStorage\.setItem\(PENDING_PAYMENT_KEY/);
  assert.match(checkout, /sessionStorage\.getItem\(PENDING_PAYMENT_KEY/);
  assert.match(service, /API_ENDPOINTS\.paymentStatus/);
  assert.doesNotMatch(checkout, /cashfree_order_id/);
});

test("provider return route is harmless and does not perform payment completion", () => {
  const routes = fs.readFileSync(path.join(root, "src/routes/AppRoutes.jsx"), "utf8");
  const statusPage = fs.readFileSync(path.join(root, "src/pages/StatusPage.jsx"), "utf8");
  assert.match(routes, /path="\/payment\/return"/);
  assert.match(statusPage, /return to the device where you started checkout/i);
  assert.doesNotMatch(statusPage, /verifyPayment|completePurchase|createOrder/);
});
