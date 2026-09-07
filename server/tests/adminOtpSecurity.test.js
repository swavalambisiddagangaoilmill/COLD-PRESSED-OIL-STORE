import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import AdminAuthOtp from "../models/AdminAuthOtp.js";
import { env } from "../config/env.js";
import { ADMIN_OTP_COOLDOWN_MS, ADMIN_OTP_MAX_ATTEMPTS, ADMIN_OTP_TTL_MS, createAdminLoginOtp, verifyAdminLoginOtp } from "../services/adminOtpService.js";

const originals = { randomInt: crypto.randomInt, findOne: AdminAuthOtp.findOne, findOneAndUpdate: AdminAuthOtp.findOneAndUpdate };
afterEach(() => {
  crypto.randomInt = originals.randomInt;
  AdminAuthOtp.findOne = originals.findOne;
  AdminAuthOtp.findOneAndUpdate = originals.findOneAndUpdate;
});

const admin = { _id: "507f1f77bcf86cd799439011", email: "admin@example.com", name: "Admin" };
const hash = (code) => crypto.createHmac("sha256", env.jwtSecret).update(`${admin._id}:${code}`).digest("hex");
const query = (record) => ({ select: async () => record });

test("admin OTP uses a 60-second cooldown, five-minute TTL, hashing, and five attempts", async () => {
  crypto.randomInt = () => 123456;
  let update;
  AdminAuthOtp.findOneAndUpdate = async (_filter, nextUpdate) => { update = nextUpdate.$set; return { _id: "otp" }; };
  const now = new Date();
  await createAdminLoginOtp(admin, now);
  assert.equal(ADMIN_OTP_COOLDOWN_MS, 60_000);
  assert.equal(ADMIN_OTP_TTL_MS, 300_000);
  assert.equal(ADMIN_OTP_MAX_ATTEMPTS, 5);
  assert.match(update.codeHash, /^[a-f0-9]{64}$/);
  assert.equal(update.codeHash.includes("123456"), false);
  assert.equal(update.expiresAt.getTime(), now.getTime() + 300_000);
});

test("concurrent resend allows one replacement and rejects the duplicate", async () => {
  crypto.randomInt = () => 123456;
  let claimed = false;
  AdminAuthOtp.findOneAndUpdate = async () => {
    if (claimed) throw Object.assign(new Error("duplicate"), { code: 11000 });
    claimed = true;
    return { _id: "otp" };
  };
  const results = await Promise.allSettled([createAdminLoginOtp(admin), createAdminLoginOtp(admin)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected" && item.reason.statusCode === 429).length, 1);
});

test("concurrent verification consumes an admin OTP exactly once", async () => {
  const record = { _id: "otp", codeHash: hash("123456"), expiresAt: new Date(Date.now() + 60_000), attempts: 0, maxAttempts: 5 };
  AdminAuthOtp.findOne = () => query(record);
  let consumed = false;
  AdminAuthOtp.findOneAndUpdate = async (filter) => {
    if (!filter.codeHash) return record;
    if (consumed) return null;
    consumed = true;
    return { ...record, consumedAt: new Date() };
  };
  const results = await Promise.allSettled([verifyAdminLoginOtp(admin, "123456"), verifyAdminLoginOtp(admin, "123456")]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("wrong admin OTP attempts are persisted and capped", async () => {
  const record = { _id: "otp", codeHash: hash("123456"), expiresAt: new Date(Date.now() + 60_000), attempts: 4, maxAttempts: 5 };
  AdminAuthOtp.findOne = () => query(record);
  AdminAuthOtp.findOneAndUpdate = async () => ({ ...record, attempts: 5 });
  await assert.rejects(() => verifyAdminLoginOtp(admin, "654321"), (error) => error.statusCode === 429);
});
