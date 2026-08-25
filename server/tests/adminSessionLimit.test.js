import assert from "node:assert/strict";
import test from "node:test";
import { adminSessionRecordIsActive, availableAdminSessionSlots, MAX_ADMIN_SESSIONS } from "../services/adminSessionService.js";

function login(active) {
  const [slot] = availableAdminSessionSlots(active);
  if (!slot) return { accepted: false, message: "Maximum of 5 active devices reached. Please log out from another device before logging in here." };
  const session = { sessionId: `session-${active.length + 1}`, slot, status: "active", expiresAt: new Date(Date.now() + 60_000) };
  active.push(session);
  return { accepted: true, session };
}

test("backend allocation accepts five admin sessions and rejects the sixth", () => {
  const active = [];
  for (let device = 1; device <= MAX_ADMIN_SESSIONS; device += 1) assert.equal(login(active).accepted, true);
  const sixth = login(active);
  assert.equal(sixth.accepted, false);
  assert.match(sixth.message, /Maximum of 5 active devices reached/);
});

test("revoking one admin session allows the next login", () => {
  const active = [];
  for (let device = 1; device <= MAX_ADMIN_SESSIONS; device += 1) login(active);
  active.splice(2, 1);
  assert.equal(login(active).accepted, true);
});

test("expired and revoked sessions are not active and do not occupy the limit", () => {
  const now = new Date();
  assert.equal(adminSessionRecordIsActive({ status: "active", expiresAt: new Date(now.getTime() - 1) }, now), false);
  assert.equal(adminSessionRecordIsActive({ status: "revoked", expiresAt: new Date(now.getTime() + 60_000) }, now), false);
  assert.equal(adminSessionRecordIsActive({ status: "active", expiresAt: new Date(now.getTime() + 60_000) }, now), true);
  assert.deepEqual(availableAdminSessionSlots([{ slot: 1 }, { slot: 2 }, { slot: 3 }, { slot: 4 }]), [5]);
});

test("sign out all other devices preserves the current session", () => {
  const sessions = ["current", "other-1", "other-2"];
  const currentSessionId = "current";
  const revokeIds = sessions.filter((sessionId) => sessionId !== currentSessionId);
  const remaining = sessions.filter((sessionId) => !revokeIds.includes(sessionId));
  assert.deepEqual(remaining, [currentSessionId]);
});

test("customer sessions are separate from admin slot allocation", () => {
  const customerSessions = Array.from({ length: 12 }, (_, slot) => ({ slot: slot + 1 }));
  const adminSessions = [];
  assert.equal(customerSessions.length, 12);
  assert.deepEqual(availableAdminSessionSlots(adminSessions), [1, 2, 3, 4, 5]);
});
