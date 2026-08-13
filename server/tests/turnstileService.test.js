import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../config/env.js";
import { verifyTurnstile } from "../services/turnstileService.js";

const originalFetch = globalThis.fetch;
const originalProduction = env.isProduction;
const originalSecret = env.turnstile.secretKey;
const originalClientUrls = env.clientUrls;

beforeEach(() => {
  env.isProduction = true;
  env.turnstile.secretKey = "test-secret-not-a-real-key";
  env.clientUrls = ["https://swavalambisiddagangaoilmill.com", "https://www.swavalambisiddagangaoilmill.com"];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  env.isProduction = originalProduction;
  env.turnstile.secretKey = originalSecret;
  env.clientUrls = originalClientUrls;
});

const request = { ip: "203.0.113.10" };

test("missing Turnstile token is rejected without contacting Cloudflare", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; };
  await assert.rejects(verifyTurnstile("", request), (error) => error.statusCode === 400 && error.errors?.[0]?.code === "TURNSTILE_REQUIRED");
  assert.equal(called, false);
});

test("fresh token from canonical or www production hostname is accepted", async () => {
  for (const hostname of ["swavalambisiddagangaoilmill.com", "www.swavalambisiddagangaoilmill.com"]) {
    globalThis.fetch = async () => ({ json: async () => ({ success: true, hostname }) });
    assert.equal((await verifyTurnstile("fresh-token", request)).success, true);
  }
});

test("valid token from an unapproved hostname is rejected", async () => {
  globalThis.fetch = async () => ({ json: async () => ({ success: true, hostname: "attacker.example" }) });
  await assert.rejects(verifyTurnstile("fresh-token", request), (error) => error.statusCode === 400 && error.errors?.[0]?.code === "TURNSTILE_HOSTNAME_MISMATCH");
});

test("expired or reused token is rejected using a customer-safe response", async () => {
  globalThis.fetch = async () => ({ json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) });
  await assert.rejects(verifyTurnstile("reused-token", request), (error) => error.message === "Human verification failed." && error.errors?.[0]?.code === "TURNSTILE_FAILED");
});
