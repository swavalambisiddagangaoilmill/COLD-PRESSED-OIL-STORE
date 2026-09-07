import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import AuthRateLimit from "../models/AuthRateLimit.js";
import SecurityEvent from "../models/SecurityEvent.js";
import { consumeSlidingWindow, slidingAuthLimiter } from "../services/authRateLimitService.js";

const originals = { findOneAndUpdate: AuthRateLimit.findOneAndUpdate, securityCreate: SecurityEvent.create };
afterEach(() => { AuthRateLimit.findOneAndUpdate = originals.findOneAndUpdate; SecurityEvent.create = originals.securityCreate; });

test("IP and account rate limits use independent, non-reversible datastore keys", async () => {
  const keys = [];
  AuthRateLimit.findOneAndUpdate = async (filter) => { keys.push(filter.key); return { hits: [new Date()] }; };
  await consumeSlidingWindow({ scope: "admin_login_ip", identifier: "203.0.113.8", limit: 2, windowMs: 60_000 });
  await consumeSlidingWindow({ scope: "admin_login_account", identifier: "owner@example.com", limit: 2, windowMs: 60_000 });
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.match(keys[0], /^[a-f0-9]{64}$/);
  assert.equal(keys.join("").includes("owner@example.com"), false);
});

test("sliding limiter returns generic 429 with Retry-After and no attempt count", async () => {
  AuthRateLimit.findOneAndUpdate = async () => ({ hits: [new Date(), new Date(), new Date()] });
  SecurityEvent.create = async () => ({});
  const limiter = slidingAuthLimiter({ scope: "test", identifier: (req) => req.ip, limit: 2, windowMs: 60_000 });
  const headers = {};
  const req = { ip: "203.0.113.8", user: null, method: "POST", originalUrl: "/api/auth/login", get: () => "test" };
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const error = await new Promise((resolve) => limiter(req, res, resolve));
  assert.equal(error.statusCode, 429);
  assert.equal(error.message, "Too many authentication attempts. Please try again later.");
  assert.deepEqual(error.errors, []);
  assert.ok(Number(headers["Retry-After"]) >= 1);
  assert.equal(headers["RateLimit-Remaining"], undefined);
});

test("the sliding window pipeline prunes expired hits before adding the current request", async () => {
  let pipeline;
  AuthRateLimit.findOneAndUpdate = async (_filter, update) => { pipeline = update; return { hits: [new Date()] }; };
  await consumeSlidingWindow({ scope: "admin_login_ip", identifier: "203.0.113.9", limit: 12, windowMs: 900_000, now: new Date("2026-09-07T12:00:00Z") });
  assert.ok(Array.isArray(pipeline));
  assert.ok(pipeline[0].$set.hits.$slice[0].$concatArrays[0].$filter);
  assert.equal(pipeline[0].$set.hits.$slice[1], 13);
});

test("concurrent first hits recover from an upsert race without bypassing the bucket", async () => {
  let calls = 0;
  AuthRateLimit.findOneAndUpdate = async (_filter, _update, options) => {
    calls += 1;
    if (options.upsert) throw Object.assign(new Error("duplicate"), { code: 11000 });
    return { hits: [new Date()] };
  };
  const result = await consumeSlidingWindow({ scope: "admin_login_account", identifier: "owner@example.com", limit: 10, windowMs: 900_000 });
  assert.equal(result.allowed, true);
  assert.equal(calls, 2);
});
