import test from "node:test";
import assert from "node:assert/strict";

function sessionStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test.beforeEach(() => {
  global.window = { sessionStorage: sessionStorage(), crypto: { randomUUID: () => "33333333-3333-4333-8333-333333333333" } };
});

test.afterEach(() => { delete global.window; });

test("stale Order A state cannot resume or confirm during Checkout B", async () => {
  const { resumablePendingPayment, writePendingPayment } = await import("../../src/utils/checkoutSession.js");
  writePendingPayment({ checkoutSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cashfreeOrderId: "cf-a" });

  assert.equal(resumablePendingPayment(""), null);
  assert.equal(resumablePendingPayment("?payment_pending=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), null);
});

test("same-device return resumes only its exact pending checkout session", async () => {
  const { resumablePendingPayment, writePendingPayment } = await import("../../src/utils/checkoutSession.js");
  const pending = { checkoutSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cashfreeOrderId: "cf-a" };
  writePendingPayment(pending);
  assert.deepEqual(resumablePendingPayment("?payment_return=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), pending);
  assert.equal(resumablePendingPayment("?payment_return=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), null);
});
