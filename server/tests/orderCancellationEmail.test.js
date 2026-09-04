import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

const originalFetch = global.fetch;
let sendOrderCancellationEmail;
let sendOrderCancellationOnce;

before(async () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.EMAIL_FROM = "orders@example.com";
  process.env.RESEND_API_KEY = "resend-test-key";
  ({ sendOrderCancellationEmail, sendOrderCancellationOnce } = await import("../services/emailService.js"));
});

afterEach(() => { global.fetch = originalFetch; });

function order(overrides = {}) {
  return {
    _id: overrides._id || "64b000000000000000000099",
    user: { name: "Ananya Rao", email: "ananya@example.com" },
    shippingAddress: { fullName: "Ananya Rao" },
    ...overrides,
  };
}

function captureResend() {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, async json() { return { id: "email_123" }; } };
  };
  return requests;
}

test("stock cancellation email uses customer details, safe reason, and responsive template", async () => {
  const requests = captureResend();
  await sendOrderCancellationEmail(order(), "Requested quantity is out of stock");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(requests[0].body.to, "ananya@example.com");
  assert.equal(requests[0].body.subject, "Update on Your Order #64b000000000000000000099");
  assert.match(requests[0].body.text, /Hi Ananya Rao,/);
  assert.match(requests[0].body.text, /products in your order became unavailable/i);
  assert.match(requests[0].body.html, /name="viewport"/);
  assert.match(requests[0].body.html, /max-width:600px/);
});

test("shipping cancellation email exposes no internal provider failure", async () => {
  const requests = captureResend();
  await sendOrderCancellationEmail(order({ shippingFailureReason: "Shiprocket authentication failed: secret token rejected" }));
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.text, /Shipping service was unavailable/);
  assert.doesNotMatch(requests[0].body.text, /Shiprocket|secret token|authentication failed/i);
});

test("generic cancellation email uses professional fallback copy", async () => {
  const requests = captureResend();
  await sendOrderCancellationEmail(order(), "Unexpected internal exception");
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.text, /issue while processing your order/i);
  assert.doesNotMatch(requests[0].body.text, /internal exception/i);
});

test("cancellation email is sent once for repeated processing", async () => {
  const requests = captureResend();
  let saves = 0;
  const cancelledOrder = order({
    cancellationEmailSentAt: null,
    async save() { saves += 1; return this; },
  });
  await sendOrderCancellationOnce(cancelledOrder, "out of stock");
  await sendOrderCancellationOnce(cancelledOrder, "out of stock");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers["Idempotency-Key"], `order-cancelled/${cancelledOrder._id}`);
  assert.equal(saves, 1);
  assert.ok(cancelledOrder.cancellationEmailSentAt instanceof Date);
});
