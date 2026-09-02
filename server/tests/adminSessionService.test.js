import assert from "node:assert/strict";
import test from "node:test";
import AdminSession from "../models/AdminSession.js";
import User from "../models/User.js";
import { loginUser } from "../services/authService.js";
import { hashValue } from "../services/authSecurityService.js";

test("complete admin password and email-code login creates one valid session", async () => {
  const originals = { create: AdminSession.create, find: AdminSession.find, updateOne: AdminSession.updateOne, findOne: User.findOne, userFind: User.find };
  const code = "123456";
  const created = [];
  const updates = [];
  const admin = {
    _id: "507f1f77bcf86cd799439011",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    isDisabled: false,
    trustedDevices: [],
    loginHistory: [],
    sessions: [],
    otpRecords: [{ purpose: "new_device", codeHash: hashValue(code), expiresAt: new Date(Date.now() + 60_000), attempts: 0, maxAttempts: 5 }],
    comparePassword: async () => true,
    save: async () => admin,
    toJSON: () => ({ _id: admin._id, email: admin.email, role: admin.role, sessions: admin.sessions }),
  };

  User.findOne = () => ({ select: async () => admin });
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  AdminSession.find = () => ({
    sort: async () => [],
    select: () => ({ lean: async () => [] }),
  });
  AdminSession.create = async (payload) => { created.push(payload); return { ...payload, deviceName: "Browser on Windows" }; };
  AdminSession.updateOne = async (...args) => { updates.push(args); return { acknowledged: true }; };

  const req = { ip: "127.0.0.1", body: {}, get: (name) => name === "user-agent" ? "Chrome Windows" : "" };
  try {
    const result = await loginUser(admin.email, "password", req, { otpCode: code });
    assert.ok(result.token);
    assert.ok(result.refreshToken);
    assert.equal(created.length, 1);
    assert.equal(created[0].slot, 1);
    assert.ok(created[0].pendingTokenHash);
    assert.ok(created[0].refreshTokenHash);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][0].sessionId, created[0].sessionId);
  } finally {
    AdminSession.create = originals.create;
    AdminSession.find = originals.find;
    AdminSession.updateOne = originals.updateOne;
    User.findOne = originals.findOne;
    User.find = originals.userFind;
  }
});
