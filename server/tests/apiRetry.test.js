import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { apiRequest } from "../../src/api/apiClient.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const immediateRetry = { delays: [0, 0, 0], timeoutMs: 100 };

test("temporary network failure retries silently and returns the successful read", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("network unavailable");
    return json({ data: { products: ["oil"] } });
  };
  assert.deepEqual(await apiRequest("/products", { retry: immediateRetry }), { products: ["oil"] });
  assert.equal(calls, 2);
});

test("temporary 500 retries silently and returns the successful read", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls < 3 ? json({ message: "temporary" }, 500) : json({ data: { ok: true } });
  assert.deepEqual(await apiRequest("/products", { retry: immediateRetry }), { ok: true });
  assert.equal(calls, 3);
});

test("exhausted transient retries return the friendly final error", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({ message: "internal detail" }, 503); };
  await assert.rejects(apiRequest("/products", { retry: immediateRetry }), (error) => {
    assert.equal(error.message, "Something went wrong. Please try again.");
    assert.equal(error.retryExhausted, true);
    assert.equal(error.attempts, 4);
    return true;
  });
  assert.equal(calls, 4);
});

test("400, 401, 403 and 404 responses are not retried", async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return json({ message: `Error ${status}` }, status); };
    await assert.rejects(apiRequest("/products/missing", { retry: immediateRetry }), (error) => error.status === status);
    assert.equal(calls, 1);
  }
});

test("order and payment mutations are never automatically duplicated", async () => {
  for (const [endpoint, method] of [["/orders", "POST"], ["/payments/intent", "POST"], ["/auth/profile", "PUT"], ["/orders/id", "DELETE"]]) {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return json({ message: "temporary" }, 500); };
    await assert.rejects(apiRequest(endpoint, { method, body: "{}", retry: immediateRetry }));
    assert.equal(calls, 1);
  }
});

test("a timed-out read is treated as transient and retried", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    if (calls > 1) return json({ data: { recovered: true } });
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  };
  assert.deepEqual(await apiRequest("/products", { retry: { delays: [0], timeoutMs: 1 } }), { recovered: true });
  assert.equal(calls, 2);
});

test("an explicitly idempotent validation POST may use read-style retries", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? json({}, 503) : json({ data: { valid: true } });
  assert.deepEqual(await apiRequest("/content/coupons/validate", { method: "POST", body: "{}", retry: { ...immediateRetry, enabled: true, idempotent: true } }), { valid: true });
  assert.equal(calls, 2);
});
