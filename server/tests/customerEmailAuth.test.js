import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import OtpVerification from "../models/OtpVerification.js";
import { env } from "../config/env.js";
import { requestAuthOtp, verifyAuthOtp } from "../services/authService.js";

const request = { ip: "127.0.0.1", body: {}, get: (name) => name === "user-agent" ? "Chrome on Windows" : "" };

test("customer signup OTP is server-generated, hashed, emailed, verified once, and issues a session", async () => {
  const originals = { findUser: User.findOne, createUser: User.create, findOtp: OtpVerification.find, updateOtp: OtpVerification.updateMany, createOtp: OtpVerification.create, deleteOtp: OtpVerification.findByIdAndDelete, findOneOtp: OtpVerification.findOne, consumeOtp: OtpVerification.findOneAndUpdate, fetch: global.fetch };
  Object.assign(env.email, { provider: "resend", resendApiKey: "test-resend-secret", from: "Store <auth@example.com>" });
  let createdRecord, emailedOtp, user, invalidatedFilter;
  User.findOne = async () => user || null;
  User.create = async (value) => { user = { _id: "customer-id", ...value, sessions: [], loginHistory: [], save: async () => user }; return user; };
  OtpVerification.find = () => ({ sort: () => ({ lean: async () => [] }) });
  OtpVerification.updateMany = async (filter) => { invalidatedFilter = filter; return { modifiedCount: 0 }; };
  OtpVerification.create = async (value) => { createdRecord = { _id: "otp-id", attempts: 0, maxAttempts: 5, consumedAt: null, save: async () => createdRecord, ...value }; return createdRecord; };
  OtpVerification.findByIdAndDelete = async () => null;
  OtpVerification.findOne = () => ({ sort: () => ({ select: async () => createdRecord?.consumedAt ? null : createdRecord }) });
  OtpVerification.findOneAndUpdate = async (_filter, update) => { if (createdRecord.consumedAt) return null; if (update.$inc) { createdRecord.attempts += 1; return createdRecord; } createdRecord.consumedAt = new Date(); return createdRecord; };
  global.fetch = async (_url, options) => { const body = JSON.parse(options.body); assert.equal(options.headers.Authorization, "Bearer test-resend-secret"); emailedOtp = body.text.match(/\b\d{6}\b/)?.[0]; return { ok: true, json: async () => ({ id: "resend-message-id" }) }; };
  try {
    const response = await requestAuthOtp({ email: " Customer@Example.COM ", purpose: "signup", name: "Customer" }, request);
    assert.deepEqual(response, { purpose: "signup", expiresIn: 300, resendAfter: 60 });
    assert.match(emailedOtp, /^\d{6}$/);
    assert.notEqual(createdRecord.otpHash, emailedOtp);
    assert.deepEqual(invalidatedFilter, { email: "customer@example.com", consumedAt: null });
    assert.equal(JSON.stringify(response).includes(emailedOtp), false);
    assert.equal(JSON.stringify(createdRecord).includes("test-resend-secret"), false);
    const wrongOtp = emailedOtp === "000000" ? "000001" : "000000";
    await assert.rejects(() => verifyAuthOtp({ email: "customer@example.com", purpose: "signup", otp: wrongOtp }, request), /incorrect/i);
    assert.equal(createdRecord.attempts, 1);
    const result = await verifyAuthOtp({ email: "customer@example.com", purpose: "signup", otp: emailedOtp }, request);
    assert.equal(result.user.email, "customer@example.com");
    assert.equal(result.user.role, "user");
    assert.equal(typeof result.token, "string");
    assert.equal(typeof result.refreshToken, "string");
    await assert.rejects(() => verifyAuthOtp({ email: "customer@example.com", purpose: "signup", otp: emailedOtp }), /expired/i);
  } finally {
    User.findOne = originals.findUser; User.create = originals.createUser; OtpVerification.find = originals.findOtp; OtpVerification.updateMany = originals.updateOtp; OtpVerification.create = originals.createOtp; OtpVerification.findByIdAndDelete = originals.deleteOtp; OtpVerification.findOne = originals.findOneOtp; OtpVerification.findOneAndUpdate = originals.consumeOtp; global.fetch = originals.fetch;
  }
});

test("customer login request prevents account enumeration", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;
  try {
    assert.deepEqual(await requestAuthOtp({ email: "missing@example.com", purpose: "login" }, request), { purpose: "login", expiresIn: 300, resendAfter: 60 });
  } finally { User.findOne = originalFindOne; }
});

test("customer OTP resend cooldown is enforced server-side", async () => {
  const originalFindOne = User.findOne, originalFind = OtpVerification.find;
  User.findOne = async () => ({ role: "user", name: "Customer" });
  OtpVerification.find = () => ({ sort: () => ({ lean: async () => [{ createdAt: new Date() }] }) });
  try {
    await assert.rejects(() => requestAuthOtp({ email: "customer@example.com", purpose: "login" }, request), (error) => error.statusCode === 429 && error.errors?.[0]?.code === "OTP_COOLDOWN");
  } finally { User.findOne = originalFindOne; OtpVerification.find = originalFind; }
});
