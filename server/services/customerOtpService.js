// Coordinates customer phone OTP login using existing user sessions.
import crypto from "crypto";
import jwt from "jsonwebtoken";
import CustomerOtp from "../models/CustomerOtp.js";
import User from "../models/User.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { normalizeIndianPhone } from "../utils/phone.js";
import { hashValue, pushLoginHistory, trustDevice } from "./authSecurityService.js";
import { issueSession } from "./authService.js";
import { verifyTurnstile } from "./turnstileService.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { sendCustomerOtp } from "./otp/otpProvider.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const SIGNUP_TOKEN_TTL = "10m";

function createOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function signSignupToken(phone) {
  return jwt.sign({ phone, type: "phone_signup" }, env.jwtSecret, { expiresIn: SIGNUP_TOKEN_TTL });
}

function verifySignupToken(token) {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (decoded.type !== "phone_signup" || !decoded.phone) throw new Error("Invalid token");
    return decoded.phone;
  } catch {
    throw new ApiError("Phone verification expired. Please request a new OTP.", 401);
  }
}

async function storeAndSendOtp(phone, req, existing = null) {
  const code = createOtpCode();
  const now = new Date();
  const record = existing || new CustomerOtp({ phone, purpose: "customer_login" });
  record.codeHash = hashValue(code);
  record.provider = env.otp.provider;
  record.attempts = 0;
  record.maxAttempts = 5;
  record.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  record.resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_MS);
  record.consumedAt = undefined;
  record.ip = req.ip;
  record.userAgent = req.get("user-agent") || "";
  if (existing) record.resendCount += 1;
  await sendCustomerOtp(phone, code);
  await record.save();
  return { resendAfterSeconds: Math.ceil((record.resendAvailableAt - now) / 1000), expiresInSeconds: Math.ceil(OTP_TTL_MS / 1000) };
}

export async function requestCustomerOtp(payload, req) {
  await verifyTurnstile(payload.turnstileToken, req);
  const phone = normalizeIndianPhone(payload.phone);
  await CustomerOtp.deleteMany({ phone, purpose: "customer_login", consumedAt: { $ne: null } });
  const existing = await CustomerOtp.findOne({ phone, purpose: "customer_login", consumedAt: null }).select("+codeHash").sort({ createdAt: -1 });
  if (existing && existing.resendAvailableAt > new Date()) {
    return { resendAfterSeconds: Math.ceil((existing.resendAvailableAt - new Date()) / 1000), expiresInSeconds: Math.max(0, Math.ceil((existing.expiresAt - new Date()) / 1000)) };
  }
  return storeAndSendOtp(phone, req, existing);
}

export async function resendCustomerOtp(payload, req) {
  return requestCustomerOtp(payload, req);
}

export async function verifyCustomerOtp(payload, req) {
  if (payload.signupToken) return completePhoneSignup(payload.signupToken, payload.name, req);
  const phone = normalizeIndianPhone(payload.phone);
  const code = String(payload.otp || "").trim();
  if (!/^\d{6}$/.test(code)) throw new ApiError("Enter the 6-digit OTP.", 422, [{ field: "otp", message: "Enter the 6-digit OTP." }]);
  const record = await CustomerOtp.findOne({ phone, purpose: "customer_login", consumedAt: null, expiresAt: { $gt: new Date() } }).select("+codeHash").sort({ createdAt: -1 });
  if (!record) throw new ApiError("OTP is expired. Please request a new OTP.", 400, [{ code: "OTP_EXPIRED" }]);
  if (record.attempts >= record.maxAttempts) throw new ApiError("Too many OTP attempts. Please request a new OTP.", 429);
  record.attempts += 1;
  if (record.codeHash !== hashValue(code)) {
    await record.save();
    throw new ApiError("Invalid OTP. Please try again.", 400, [{ field: "otp", message: "Invalid OTP. Please try again." }]);
  }
  record.consumedAt = new Date();
  await record.save();

  const user = await User.findOne({ phone }).select("+sessions.refreshTokenHash");
  if (!user) return { nameRequired: true, signupToken: signSignupToken(phone) };
  if (user.role === "admin") throw new ApiError("Use admin login for this account.", 403);
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
  user.phoneVerified = true;
  trustDevice(user, req);
  pushLoginHistory(user, req, "phone_otp_login");
  return issueSession(user, undefined, req, true);
}

export async function completePhoneSignup(signupToken, name, req) {
  const phone = verifySignupToken(signupToken);
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  if (cleanName.length < 2 || cleanName.length > 80) throw new ApiError("Enter your full name.", 422, [{ field: "name", message: "Enter your full name." }]);
  let user = await User.findOne({ phone }).select("+sessions.refreshTokenHash");
  if (user) {
    if (user.role === "admin") throw new ApiError("Use admin login for this account.", 403);
    if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
    return issueSession(user, undefined, req, true);
  }
  user = new User({ name: cleanName, phone, phoneVerified: true, role: "user", emailVerified: false });
  trustDevice(user, req);
  pushLoginHistory(user, req, "phone_otp_register");
  await user.save({ validateBeforeSave: false });
  await createAdminNotification({ category: "customers", type: "new_user_registration", title: "New User Registration", description: `${user.name} created an account with phone OTP.`, related: { kind: "User", id: user._id, label: user.name, path: "/admin/customers" } });
  return issueSession(user, undefined, req, true);
}