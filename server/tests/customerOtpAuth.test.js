import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import CustomerAuthOtp from "../models/CustomerAuthOtp.js";
import User from "../models/User.js";
import { requestCustomerAuthOtp, verifyCustomerAuthOtp } from "../services/authService.js";

const originals = {
  randomInt: crypto.randomInt,
  otpFindOne: CustomerAuthOtp.findOne,
  otpFindOneAndUpdate: CustomerAuthOtp.findOneAndUpdate,
  userFindOne: User.findOne,
  userFind: User.find,
  userCreate: User.create,
};

afterEach(() => {
  crypto.randomInt = originals.randomInt;
  CustomerAuthOtp.findOne = originals.otpFindOne;
  CustomerAuthOtp.findOneAndUpdate = originals.otpFindOneAndUpdate;
  User.findOne = originals.userFindOne;
  User.find = originals.userFind;
  User.create = originals.userCreate;
});

const req = { ip: "127.0.0.1", body: {}, get: () => "test-agent" };
const query = (value) => ({ select: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });

function customer(overrides = {}) {
  return { _id: "existing-customer-id", name: "Existing Customer", email: "customer@example.com", role: "user", isDisabled: false, emailVerified: false, trustedDevices: [], loginHistory: [], sessions: [], save: async function save() { return this; }, ...overrides };
}

async function issuedRecord(payload = { email: "customer@example.com", flow: "login" }) {
  crypto.randomInt = () => 123456;
  CustomerAuthOtp.findOne = () => query(null);
  User.findOne = () => query(customer());
  let stored;
  CustomerAuthOtp.findOneAndUpdate = async (filter, update) => { stored = { _id: "otp-id", email: filter.email, ...update.$set }; return stored; };
  await requestCustomerAuthOtp(payload, req);
  return stored;
}

test("OTP request stores only a hash with a five-minute expiry", async () => {
  const before = Date.now();
  const record = await issuedRecord();
  assert.match(record.codeHash, /^[a-f0-9]{64}$/);
  assert.equal(record.codeHash.includes("123456"), false);
  assert.ok(record.expiresAt.getTime() >= before + 299000 && record.expiresAt.getTime() <= before + 301000);
  assert.equal(record.attempts, 0);
});

test("resend cooldown does not issue a replacement code", async () => {
  CustomerAuthOtp.findOne = () => query({ lastSentAt: new Date(), requestWindowStartedAt: new Date(), requestCount: 1 });
  let writes = 0;
  CustomerAuthOtp.findOneAndUpdate = async () => { writes += 1; };
  await requestCustomerAuthOtp({ email: "customer@example.com", flow: "login" }, req);
  assert.equal(writes, 0);
});

test("valid OTP is atomically consumed and reuses the existing customer identity", async () => {
  const record = await issuedRecord();
  const existing = customer();
  CustomerAuthOtp.findOne = () => query(record);
  CustomerAuthOtp.findOneAndUpdate = async (filter, update) => filter.codeHash ? { ...record, ...update.$set } : record;
  User.findOne = () => query(existing);
  const result = await verifyCustomerAuthOtp({ email: record.email, otp: "123456" }, req);
  assert.equal(result.user._id, "existing-customer-id");
  assert.equal(result.user.emailVerified, true);
  assert.ok(result.token && result.refreshToken);
});

test("signup OTP creates a passwordless customer and issues the existing session", async () => {
  const record = await issuedRecord({ name: "New Customer", email: "new@example.com", flow: "signup" });
  CustomerAuthOtp.findOne = () => query(record);
  CustomerAuthOtp.findOneAndUpdate = async (filter, update) => filter.codeHash ? { ...record, ...update.$set } : record;
  User.findOne = () => query(null);
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  let createdPayload;
  User.create = async (payload) => { createdPayload = payload; return customer({ _id: "new-customer-id", ...payload }); };
  const result = await verifyCustomerAuthOtp({ email: record.email, otp: "123456" }, req);
  assert.equal(createdPayload.password, undefined);
  assert.equal(createdPayload.name, "New Customer");
  assert.equal(result.user._id, "new-customer-id");
  assert.ok(result.token && result.refreshToken);
});

test("wrong OTP increments attempts and is rejected", async () => {
  const record = await issuedRecord();
  CustomerAuthOtp.findOne = () => query(record);
  CustomerAuthOtp.findOneAndUpdate = async () => ({ ...record, attempts: 1 });
  await assert.rejects(() => verifyCustomerAuthOtp({ email: record.email, otp: "654321" }, req), /invalid or expired/i);
});

test("expired, reused, and attempt-exhausted OTPs are rejected", async () => {
  const base = { _id: "otp-id", email: "customer@example.com", codeHash: "hash", expiresAt: new Date(Date.now() + 60000), attempts: 0, maxAttempts: 5 };
  for (const record of [{ ...base, expiresAt: new Date(Date.now() - 1) }, { ...base, consumedAt: new Date() }, { ...base, attempts: 5 }]) {
    CustomerAuthOtp.findOne = () => query(record);
    await assert.rejects(() => verifyCustomerAuthOtp({ email: base.email, otp: "123456" }, req), /invalid or expired|too many verification attempts/i);
  }
});
