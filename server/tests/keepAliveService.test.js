import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeepAliveService } from "../services/keepAliveService.js";

function config(overrides = {}) {
  return {
    enabled: true,
    baseUrl: "https://api.example.com",
    intervalSeconds: 180,
    jitterSeconds: 30,
    path: "/api/health",
    logging: false,
    timeoutMs: 10_000,
    ...overrides,
  };
}

function harness(overrides = {}) {
  const scheduled = [];
  const cancelled = [];
  const warnings = [];
  const dependencies = {
    fetchImpl: async () => ({ ok: true, status: 200 }),
    scheduleTimeout: (callback, delay) => {
      const handle = { callback, delay, unref() {} };
      scheduled.push(handle);
      return handle;
    },
    cancelScheduledTimeout: (handle) => cancelled.push(handle),
    scheduleAbort: () => ({ unref() {} }),
    cancelAbort: () => {},
    random: () => 0.5,
    logger: { info() {}, warn: (message) => warnings.push(message) },
    ...overrides,
  };
  return { dependencies, scheduled, cancelled, warnings };
}

test("start schedules once and duplicate initialization is ignored", () => {
  const fake = harness();
  const service = createKeepAliveService(config(), fake.dependencies);
  assert.equal(service.start(), true);
  assert.equal(service.start(), false);
  assert.equal(fake.scheduled.length, 1);
  assert.equal(service.isStarted(), true);
});

test("each delay remains inside the configured jitter range", () => {
  const low = createKeepAliveService(config(), harness({ random: () => 0 }).dependencies);
  const high = createKeepAliveService(config(), harness({ random: () => 1 }).dependencies);
  assert.equal(low.nextDelayMs(), 150_000);
  assert.equal(high.nextDelayMs(), 210_000);
});

test("request uses the configured URL and schedules a fresh attempt", async () => {
  let requestedUrl;
  const fake = harness({ fetchImpl: async (url) => { requestedUrl = url; return { ok: true, status: 200 }; } });
  const service = createKeepAliveService(config({ baseUrl: "https://backend.example.com/root/" }), fake.dependencies);
  service.start();
  await fake.scheduled[0].callback();
  assert.equal(requestedUrl, "https://backend.example.com/api/health");
  assert.equal(fake.scheduled.length, 2);
});

test("network failures do not escape or create a tight retry", async () => {
  const fake = harness({ fetchImpl: async () => { throw new Error("connection refused"); } });
  const service = createKeepAliveService(config(), fake.dependencies);
  service.start();
  await fake.scheduled[0].callback();
  assert.equal(fake.warnings.length, 1);
  assert.match(fake.warnings[0], /connection refused/);
  assert.equal(fake.scheduled.length, 2);
  assert.ok(fake.scheduled[1].delay >= 150_000);
});

test("HTTP failures are logged once and rescheduled", async () => {
  const fake = harness({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  const service = createKeepAliveService(config(), fake.dependencies);
  service.start();
  await fake.scheduled[0].callback();
  assert.deepEqual(fake.warnings, ["[KeepAlive] health check failed: HTTP 503"]);
  assert.equal(fake.scheduled.length, 2);
});

test("stop cancels the pending timer and prevents another attempt", async () => {
  const fake = harness();
  const service = createKeepAliveService(config(), fake.dependencies);
  service.start();
  const pending = fake.scheduled[0];
  assert.equal(service.stop(), true);
  assert.deepEqual(fake.cancelled, [pending]);
  await pending.callback();
  assert.equal(fake.scheduled.length, 1);
  assert.equal(service.stop(), false);
});

test("disabled configuration and missing base URL never schedule", () => {
  const disabled = harness();
  const missingUrl = harness();
  assert.equal(createKeepAliveService(config({ enabled: false }), disabled.dependencies).start(), false);
  assert.equal(createKeepAliveService(config({ baseUrl: "" }), missingUrl.dependencies).start(), false);
  assert.equal(disabled.scheduled.length, 0);
  assert.equal(missingUrl.scheduled.length, 0);
});
