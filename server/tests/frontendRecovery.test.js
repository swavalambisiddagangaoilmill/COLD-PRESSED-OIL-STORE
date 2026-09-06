import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("global render recovery is bounded and retains the final fallback", async () => {
  const boundary = await source("../../src/components/features/feedback/ErrorBoundary.jsx");
  assert.match(boundary, /MAX_RECOVERY_ATTEMPTS = 3/);
  assert.match(boundary, /RECOVERY_DELAYS = \[150, 400, 900\]/);
  assert.match(boundary, /nextAttempt > MAX_RECOVERY_ATTEMPTS/);
  assert.match(boundary, /RuntimeErrorFallback onRetry=\{this\.retry\} onGoHome=\{this\.goHome\}/);
  assert.doesNotMatch(boundary, /apiRequest|fetch\(|payment|shipment|order creation/i);
});

test("recovery overlay blocks interaction and shares the reference-counted scroll lock", async () => {
  const [boundary, overlay, lock] = await Promise.all([
    source("../../src/components/features/feedback/ErrorBoundary.jsx"),
    source("../../src/components/features/feedback/RecoveryOverlay.jsx"),
    source("../../src/hooks/useBodyScrollLock.js"),
  ]);
  assert.match(overlay, /fixed inset-0 z-\[1000\]/);
  assert.match(overlay, /aria-busy="true"/);
  assert.match(overlay, /backdrop-blur-sm/);
  assert.match(boundary, /lockBodyScroll\(\)/);
  assert.match(boundary, /unlockBodyScroll\(\)/);
  assert.match(lock, /lockCount \+= 1/);
  assert.match(lock, /lockCount = Math\.max\(0, lockCount - 1\)/);
});

test("safe diagnostics record bounded recovery metadata without exposing it in the overlay", async () => {
  const [reporting, overlay] = await Promise.all([
    source("../../src/utils/errorReporting.js"),
    source("../../src/components/features/feedback/RecoveryOverlay.jsx"),
  ]);
  assert.match(reporting, /retryCount:/);
  assert.match(reporting, /recoveryResult:/);
  assert.match(reporting, /httpStatus:/);
  assert.doesNotMatch(overlay, /stack|ObjectId|paymentId|token|credential/i);
});

test("API recovery retries transient GET reads only and emits one global recovery lifecycle", async () => {
  const [client, app] = await Promise.all([
    source("../../src/api/apiClient.js"),
    source("../../src/App.jsx"),
  ]);
  assert.match(client, /READ_RETRY_DELAYS = \[200, 600\]/);
  assert.match(client, /method !== "GET"\) return executeRequest/);
  assert.match(client, /error\?\.name === "AbortError"/);
  assert.doesNotMatch(client, /\[408, 425, 429/);
  assert.match(client, /recoveryEvent\("start"/);
  assert.match(client, /recoveryEvent\("end"/);
  assert.match(app, /<GlobalRequestRecovery \/>/);
  assert.match(app, /useBodyScrollLock\(active\)/);
  assert.match(app, /content\.inert = true/);
  assert.match(app, /id="application-content"/);
});

test("transient GET recovery executes three bounded attempts while a mutation executes once", async () => {
  const original = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch, CustomEvent: globalThis.CustomEvent };
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event), setTimeout };
  globalThis.document = { cookie: "" };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  try {
    const { apiRequest } = await import(`../../src/api/apiClient.js?recovery=${Date.now()}`);
    let reads = 0;
    globalThis.fetch = async () => {
      reads += 1;
      if (reads < 3) throw new TypeError("temporary network failure");
      return { ok: true, json: async () => ({ data: { recovered: true } }) };
    };
    assert.deepEqual(await apiRequest("/recovery-test"), { recovered: true });
    assert.equal(reads, 3);
    assert.equal(events.filter((event) => event.type === "ss-oil-mill-recovery-start").length, 1);
    assert.equal(events.filter((event) => event.type === "ss-oil-mill-recovery-end").length, 1);

    let mutations = 0;
    globalThis.fetch = async () => { mutations += 1; throw new TypeError("temporary network failure"); };
    await assert.rejects(apiRequest("/no-retry", { method: "POST", body: "{}" }), /temporarily unavailable/);
    assert.equal(mutations, 1);
  } finally {
    Object.assign(globalThis, original);
  }
});
