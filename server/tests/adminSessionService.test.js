import assert from "node:assert/strict";
import test from "node:test";
import AdminSession from "../models/AdminSession.js";
import User from "../models/User.js";
import { createAdminSession } from "../services/adminSessionService.js";

test("admin sessions use a unique provisional refresh-token hash", async () => {
  const originalCreate = AdminSession.create;
  const originalFind = User.find;
  const created = [];

  AdminSession.create = async (payload) => {
    created.push(payload);
    return payload;
  };
  User.find = () => ({ select: () => ({ lean: async () => [] }) });

  const req = { get: () => "", ip: "127.0.0.1" };
  const admin = { _id: "admin-id", role: "admin", email: "admin@example.com" };

  try {
    await createAdminSession(req, admin);
    await createAdminSession(req, admin);
  } finally {
    AdminSession.create = originalCreate;
    User.find = originalFind;
  }

  assert.notEqual(created[0].sessionId, created[1].sessionId);
  assert.notEqual(created[0].refreshTokenHash, created[1].refreshTokenHash);
});
