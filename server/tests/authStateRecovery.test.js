import assert from "node:assert/strict";
import test from "node:test";
import { authFailureKind, resolveStoredSession } from "../../src/context/authSessionState.js";
import { adminOnly } from "../middleware/admin.js";
import { requireAdmin } from "../admin/middleware/adminAuth.js";

const failure = (status) => Object.assign(new Error(`HTTP ${status || "network"}`), { status });

test("admin profile is restored from the backend-confirmed current user", async () => {
  const user = { id: "owner", role: "admin", adminRole: "OWNER" };
  const result = await resolveStoredSession({ getProfile: async () => ({ user }), refreshAccount: async () => assert.fail("refresh must not run"), delays: [] });
  assert.deepEqual(result, { status: "confirmed", user });
});

test("a 401 refreshes exactly once and restores the authoritative role", async () => {
  let refreshes = 0;
  const user = { id: "owner", role: "admin", adminRole: "OWNER" };
  const result = await resolveStoredSession({
    getProfile: async () => { throw failure(401); },
    refreshAccount: async () => { refreshes += 1; return { user, token: "new-access", refreshToken: "new-refresh" }; },
    delays: [],
  });
  assert.equal(refreshes, 1);
  assert.equal(result.status, "confirmed");
  assert.equal(result.user.role, "admin");
});

test("a definitive refresh 401 becomes unauthenticated", async () => {
  const result = await resolveStoredSession({ getProfile: async () => { throw failure(401); }, refreshAccount: async () => { throw failure(401); }, delays: [] });
  assert.equal(result.status, "unauthenticated");
});

test("a temporary refresh outage does not turn an expired session into logout", async () => {
  let refreshes = 0;
  const result = await resolveStoredSession({
    getProfile: async () => { throw failure(401); },
    refreshAccount: async () => { refreshes += 1; throw failure(503); },
    delays: [1, 2],
    waitFor: async () => undefined,
  });
  assert.equal(refreshes, 3);
  assert.equal(result.status, "unavailable");
});

test("a 403 remains an authorization failure and never refreshes", async () => {
  let refreshes = 0;
  const result = await resolveStoredSession({ getProfile: async () => { throw failure(403); }, refreshAccount: async () => { refreshes += 1; }, delays: [] });
  assert.equal(result.status, "forbidden");
  assert.equal(refreshes, 0);
});

test("temporary backend failure retries bounded reads and does not become anonymous", async () => {
  let reads = 0;
  const waits = [];
  const user = { id: "customer", role: "customer" };
  const result = await resolveStoredSession({
    getProfile: async () => { reads += 1; if (reads < 3) throw failure(503); return { user }; },
    refreshAccount: async () => assert.fail("refresh must not run for 5xx"),
    delays: [1, 2, 3],
    waitFor: async (delay) => waits.push(delay),
  });
  assert.equal(result.status, "confirmed");
  assert.equal(reads, 3);
  assert.deepEqual(waits, [1, 2]);
});

test("exhausted network recovery preserves an unavailable session instead of logging out", async () => {
  const result = await resolveStoredSession({
    getProfile: async () => { throw failure(0); },
    refreshAccount: async () => assert.fail("refresh must not run for network failures"),
    delays: [1, 2],
    waitFor: async () => undefined,
  });
  assert.equal(result.status, "unavailable");
  assert.equal(authFailureKind(result.error), "unavailable");
});

test("customer and admin roles are never inferred or carried between resolutions", async () => {
  const admin = await resolveStoredSession({ getProfile: async () => ({ user: { id: "one", role: "admin" } }), refreshAccount: async () => {}, delays: [] });
  const customer = await resolveStoredSession({ getProfile: async () => ({ user: { id: "two", role: "customer" } }), refreshAccount: async () => {}, delays: [] });
  assert.equal(admin.user.role, "admin");
  assert.equal(customer.user.role, "customer");
  assert.notEqual(customer.user.id, admin.user.id);
});

test("logged-out users and customers are rejected by both backend admin boundaries", () => {
  for (const user of [null, { id: "customer", role: "customer" }]) {
    let legacyError;
    let panelError;
    adminOnly({ user }, {}, (error) => { legacyError = error; });
    requireAdmin({ user }, {}, (error) => { panelError = error; });
    assert.equal(legacyError.statusCode, 403);
    assert.equal(panelError.statusCode, 403);
  }
});

test("logout and route guards remain fail-closed in source", async () => {
  const { readFile } = await import("node:fs/promises");
  const [context, navbar, route, customerRoute, backend] = await Promise.all([
    readFile(new URL("../../src/context/AuthContext.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/layout/Navbar.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/admin/routes/AdminProtectedRoute.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/features/auth/ProtectedRoute.jsx", import.meta.url), "utf8"),
    readFile(new URL("../admin/middleware/adminAuth.js", import.meta.url), "utf8"),
  ]);
  assert.match(context, /setUser\(null\)[\s\S]*await logoutAccount/);
  assert.match(navbar, /user\?\.role === "admin"/);
  assert.match(route, /user\?\.role !== "admin"/);
  assert.match(route, /authError[\s\S]*code="503"/);
  assert.match(customerRoute, /authError[\s\S]*"503"/);
  assert.match(backend, /user\.role !== "admin"/);
  assert.match(backend, /requireAdminPermission/);
});
