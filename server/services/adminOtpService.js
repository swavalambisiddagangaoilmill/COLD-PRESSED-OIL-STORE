import crypto from "node:crypto";
import AdminAuthOtp from "../models/AdminAuthOtp.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { sendOtpEmail } from "./emailService.js";

export const ADMIN_OTP_TTL_MS = 5 * 60 * 1000;
export const ADMIN_OTP_COOLDOWN_MS = 60 * 1000;
export const ADMIN_OTP_MAX_ATTEMPTS = 5;

const hashCode = (adminId, code) => crypto.createHmac("sha256", env.jwtSecret).update(`${adminId}:${code}`).digest("hex");
const cooldownError = () => new ApiError("Please wait before requesting another security code.", 429);

export async function createAdminLoginOtp(admin, now = new Date()) {
  const code = String(crypto.randomInt(100000, 1000000));
  try {
    const record = await AdminAuthOtp.findOneAndUpdate(
      { admin: admin._id, $or: [{ lastSentAt: { $lte: new Date(now.getTime() - ADMIN_OTP_COOLDOWN_MS) } }, { lastSentAt: { $exists: false } }] },
      { $set: { codeHash: hashCode(admin._id, code), expiresAt: new Date(now.getTime() + ADMIN_OTP_TTL_MS), attempts: 0, maxAttempts: ADMIN_OTP_MAX_ATTEMPTS, lastSentAt: now, consumedAt: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (!record) throw cooldownError();
  } catch (error) {
    if (error?.code === 11000) throw cooldownError();
    throw error;
  }
  await sendOtpEmail(admin, code, "new_device");
}

export async function verifyAdminLoginOtp(admin, code, now = new Date()) {
  const record = await AdminAuthOtp.findOne({ admin: admin._id }).select("+codeHash");
  if (!record || record.consumedAt || record.expiresAt <= now) throw new ApiError("Security code is invalid or expired.", 400);
  if (record.attempts >= record.maxAttempts) throw new ApiError("Too many security code attempts.", 429);
  const codeHash = hashCode(admin._id, code);
  if (record.codeHash !== codeHash) {
    const updated = await AdminAuthOtp.findOneAndUpdate({ _id: record._id, consumedAt: null, attempts: { $lt: record.maxAttempts } }, { $inc: { attempts: 1 } }, { new: true });
    if (!updated || updated.attempts >= updated.maxAttempts) throw new ApiError("Too many security code attempts.", 429);
    throw new ApiError("Security code is invalid or expired.", 400);
  }
  const consumed = await AdminAuthOtp.findOneAndUpdate(
    { _id: record._id, codeHash, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: record.maxAttempts } },
    { $set: { consumedAt: now }, $unset: { codeHash: 1 } },
    { new: true }
  );
  if (!consumed) throw new ApiError("Security code is invalid or expired.", 400);
  return true;
}
