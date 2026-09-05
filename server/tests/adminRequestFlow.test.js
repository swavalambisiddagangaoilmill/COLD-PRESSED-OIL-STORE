import assert from "node:assert/strict";
import express from "express";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAdminLimiters } from "../middleware/rateLimits.js";
import { apiRequest } from "../../src/api/apiClient.js";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin traffic uses authenticated session buckets instead of the global IP bucket", async () => {
  const [app, limits, adminRoutes] = await Promise.all([
    source("../app.js"),
    source("../middleware/rateLimits.js"),
    source("../admin/routes/adminApiRoutes.js"),
  ]);
  assert.match(app, /app\.use\(publicApiLimiter\)/);
  assert.match(app, /app\.set\("trust proxy", 1\)/);
  assert.ok(app.indexOf('app.get("/api/health"') < app.indexOf("app.use(publicApiLimiter)"));
  assert.match(limits, /req\.user\._id/);
  assert.match(limits, /req\.authSessionId/);
  assert.match(limits, /api\\\/admin/);
  assert.match(limits, /req\.method === "OPTIONS"/);
  assert.match(adminRoutes, /router\.use\(protect, requireAdmin\);\s*router\.use\(adminReadLimiter, adminMutationLimiter\)/);
});

test("authentication and sensitive routes retain their dedicated protection", async () => {
  const [authRoutes, authContext] = await Promise.all([
    source("../routes/authRoutes.js"),
    source("../../src/context/AuthContext.jsx"),
  ]);
  assert.match(authRoutes, /const authLimiter = rateLimit/);
  assert.match(authRoutes, /const sensitiveLimiter = rateLimit/);
  assert.match(authRoutes, /customerOtpRequestLimiter/);
  assert.match(authRoutes, /customerOtpVerifyLimiter/);
  assert.equal((authContext.match(/getProfile\(\)/g) || []).length, 1);
  assert.doesNotMatch(authContext, /setInterval|\/refresh/);
});

test("admin reads and mutations remain separately rate limited", async () => {
  const limits = await source("../middleware/rateLimits.js");
  assert.match(limits, /adminReadLimiter/);
  assert.match(limits, /adminMutationLimiter/);
  assert.match(limits, /!\["GET", "HEAD"\]\.includes\(req\.method\)/);
  assert.match(limits, /\["GET", "HEAD"\]\.includes\(req\.method\)/);
  assert.match(limits, /mutationLimit = 100/);
});

test("rate limits block abuse but isolate legitimate admin sessions and skip OPTIONS", async (t) => {
  const app = express();
  const { read, mutation } = createAdminLimiters({ readLimit: 2, mutationLimit: 2 });
  app.use((req, _res, next) => {
    req.user = { _id: req.get("x-admin") || "owner" };
    req.authSessionId = req.get("x-session") || "session-a";
    next();
  });
  app.use(read, mutation);
  app.all("/resource", (_req, res) => res.status(200).json({ success: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/resource`;
  const request = (method = "GET", session = "session-a") => fetch(url, { method, headers: { "x-admin": "owner", "x-session": session } });

  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
  assert.equal((await request("GET", "session-b")).status, 200);
  assert.equal((await request("POST", "session-b")).status, 200);
  assert.equal((await request("POST", "session-b")).status, 200);
  assert.equal((await request("POST", "session-b")).status, 429);
  assert.equal((await request("OPTIONS", "session-b")).status, 200);
});

test("frontend deduplicates concurrent GETs and never recursively retries 429 responses", async () => {
  const api = await source("../../src/api/apiClient.js");
  assert.match(api, /pendingReads\.has\(key\)/);
  assert.match(api, /pendingReads\.delete\(key\)/);
  assert.match(api, /Too many requests\. Please wait a moment and try again\./);
  assert.doesNotMatch(api, /setTimeout\([^)]*apiRequest|apiRequest\([^)]*\)\.catch\([^)]*apiRequest/);
});

test("API errors surface field validation details and a 429 performs one request only", async () => {
  const originals = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
  globalThis.window = { dispatchEvent() {} };
  globalThis.document = { cookie: "" };
  globalThis.localStorage = { getItem() { return null; } };
  try {
    globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ message: "Validation failed.", errors: [{ field: "name", message: "Category name is required." }] }) });
    await assert.rejects(() => apiRequest("/categories", { method: "POST", body: JSON.stringify({}) }), /Category name is required/);
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return { ok: false, status: 429, json: async () => ({}) }; };
    await assert.rejects(() => apiRequest("/admin-panel/orders"), /Too many requests\. Please wait a moment/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.window = originals.window;
    globalThis.document = originals.document;
    globalThis.localStorage = originals.localStorage;
  }
});

test("admin background polling is bounded and storefront commerce polling pauses on admin routes", async () => {
  const [bell, cart, wishlist] = await Promise.all([
    source("../../src/admin/components/AdminNotificationBell.jsx"),
    source("../../src/context/CartContext.jsx"),
    source("../../src/context/WishlistContext.jsx"),
  ]);
  assert.match(bell, /loadingRef\.current/);
  assert.match(bell, /setInterval\(load, 60000\)/);
  assert.match(cart, /pathname\.startsWith\("\/admin"\)/);
  assert.match(wishlist, /pathname\.startsWith\("\/admin"\)/);
});
