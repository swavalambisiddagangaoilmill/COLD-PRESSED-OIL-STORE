import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import { loginAdmin } from "../services/adminAuthService.js";
import { requestAuthOtp } from "../services/authService.js";
import { hashValue, verifyAdminOtp } from "../services/authSecurityService.js";

const request = { ip: "127.0.0.1", body: {}, get: (name) => name === "user-agent" ? "Chrome on Windows" : "" };

test("admin password comparison uses the restored bcrypt hash", async () => {
  const admin = new User({ name: "Admin", email: "admin@example.com", role: "admin" });
  admin.password = await bcrypt.hash("correct-password", 12);
  assert.equal(await admin.comparePassword("correct-password"), true);
  assert.equal(await admin.comparePassword("wrong-password"), false);
});

test("admin email OTP is single-use and rejects an invalid code", () => {
  const valid = { otpRecords: [{ purpose: "new_device", codeHash: hashValue("123456"), expiresAt: new Date(Date.now() + 60_000), attempts: 0, maxAttempts: 5, verified: false }] };
  verifyAdminOtp(valid, "123456");
  assert.equal(valid.otpRecords[0].verified, true);
  assert.throws(() => verifyAdminOtp(valid, "123456"), /expired/i);
  const invalid = { otpRecords: [{ purpose: "new_device", codeHash: hashValue("123456"), expiresAt: new Date(Date.now() + 60_000), attempts: 0, maxAttempts: 5, verified: false }] };
  assert.throws(() => verifyAdminOtp(invalid, "000000"), /Invalid security code/);
  assert.equal(invalid.otpRecords[0].attempts, 1);
});

test("valid admin email and password require email OTP before a session is issued", async () => {
  const originalFindOne = User.findOne;
  const admin = { _id: "admin-id", name: "Admin", email: "admin@example.com", role: "admin", isDisabled: false, otpRecords: [], loginHistory: [], comparePassword: async () => true, save: async () => admin };
  User.findOne = () => ({ select: async () => admin });
  try {
    const result = await loginAdmin({ email: admin.email, password: "correct-password" }, request);
    assert.equal(result.otpRequired, true);
    assert.equal(admin.otpRecords.length, 1);
    assert.notEqual(admin.otpRecords[0].codeHash, undefined);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("customer email OTP cannot authenticate an admin account and does not enumerate it", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => ({ role: "admin" });
  try {
    const result = await requestAuthOtp({ email: "admin@example.com", purpose: "login" }, request);
    assert.deepEqual(result, { purpose: "login", expiresIn: 300, resendAfter: 60 });
  } finally {
    User.findOne = originalFindOne;
  }
});
