import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import User from "../models/User.js";
import OtpVerification from "../models/OtpVerification.js";
import { ApiError } from "../utils/ApiError.js";
import { signRefreshToken, signToken, verifyToken } from "../utils/jwt.js";
import { findSessionByRefresh, getDeviceFingerprint, hashValue, pushLoginHistory, revokeSession, upsertSession } from "./authSecurityService.js";
import { attachRefreshToken, createAdminSession, findAdminSessionByRefresh, revokeAdminSessions } from "./adminSessionService.js";
import { sendCustomerOtpEmail } from "./emailService.js";

const OTP_TTL_MS = 300_000, RESEND_COOLDOWN_MS = 60_000, EMAIL_WINDOW_MS = 900_000, EMAIL_LIMIT = 5;
const requestHash = (value) => hashValue(String(value || "unknown"));
export const normalizeCustomerEmail = (value) => String(value || "").trim().toLowerCase();
const otpHash = (email, otp) => crypto.createHmac("sha256", env.jwtSecret).update(`${email}:${otp}`).digest("hex");
const safeEqual = (left, right) => { const a = Buffer.from(String(left || ""), "hex"), b = Buffer.from(String(right || ""), "hex"); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const publicCustomer = (user) => ({ _id: user._id, name: user.name, email: user.email, role: user.role });
const googleClient = new OAuth2Client();

export async function issueSession(user, id = crypto.randomUUID(), req = null) {
  let sessionId = id;
  if (user.role === "admin" && req) sessionId = (await createAdminSession(req, user)).sessionId;
  const token = signToken(user._id, sessionId), refreshToken = signRefreshToken(user._id, sessionId);
  if (user.role === "admin") await attachRefreshToken(sessionId, refreshToken);
  user.refreshToken = refreshToken;
  if (req && user.role !== "admin") upsertSession(user, req, refreshToken, sessionId, false);
  await user.save({ validateBeforeSave: false });
  user.refreshToken = undefined;
  return { user, token, refreshToken };
}

export async function requestAuthOtp({ email, purpose, name }, req) {
  const normalizedEmail = normalizeCustomerEmail(email);
  const resolvedPurpose = purpose || (String(name || "").trim() ? "signup" : "login");
  const existingUser = await User.findOne({ email: normalizedEmail });
  const eligible = existingUser?.role !== "admin" && (resolvedPurpose === "signup" || Boolean(existingUser));
  if (resolvedPurpose === "signup" && String(name || "").trim().length < 2) throw new ApiError("Enter your full name.", 422);
  if (!eligible) {
    crypto.createHmac("sha256", env.jwtSecret).update(`${normalizedEmail}:${crypto.randomBytes(8).toString("hex")}`).digest();
    return { purpose: resolvedPurpose, expiresIn: 300, resendAfter: 60 };
  }
  const recent = await OtpVerification.find({ email: normalizedEmail, createdAt: { $gt: new Date(Date.now() - EMAIL_WINDOW_MS) } }).sort({ createdAt: -1 }).lean();
  if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(recent[0].createdAt).getTime())) / 1000);
    throw new ApiError(`Please wait ${retryAfter} seconds before requesting another code.`, 429, [{ code: "OTP_COOLDOWN", retryAfter }]);
  }
  if (recent.length >= EMAIL_LIMIT) throw new ApiError("Too many OTP requests. Please try again later.", 429, [{ code: "OTP_RATE_LIMIT" }]);
  await OtpVerification.updateMany({ email: normalizedEmail, consumedAt: null }, { $set: { consumedAt: new Date() } });
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const record = await OtpVerification.create({ email: normalizedEmail, purpose: resolvedPurpose, fullName: resolvedPurpose === "signup" ? String(name).trim() : existingUser?.name, otpHash: otpHash(normalizedEmail, otp), expiresAt: new Date(Date.now() + OTP_TTL_MS), requestedByIpHash: requestHash(req.ip), requestedByDeviceHash: requestHash(getDeviceFingerprint(req)) });
  try { await sendCustomerOtpEmail({ email: normalizedEmail, name: record.fullName || existingUser?.name }, otp); }
  catch { await OtpVerification.findByIdAndDelete(record._id); throw new ApiError("Unable to send the verification code. Please try again.", 502, [{ code: "EMAIL_SEND_FAILED" }]); }
  return { purpose: resolvedPurpose, expiresIn: 300, resendAfter: 60 };
}

export async function verifyAuthOtp({ email, purpose, otp }, req) {
  const normalizedEmail = normalizeCustomerEmail(email);
  const record = await OtpVerification.findOne({ email: normalizedEmail, purpose, consumedAt: null }).sort({ createdAt: -1 }).select("+otpHash");
  if (!record || record.expiresAt <= new Date()) throw new ApiError("This code has expired. Request a new code.", 400, [{ code: "OTP_EXPIRED" }]);
  if (record.attempts >= record.maxAttempts) throw new ApiError("Too many incorrect attempts. Request a new code.", 429, [{ code: "OTP_ATTEMPTS_EXCEEDED" }]);
  if (!safeEqual(record.otpHash, otpHash(normalizedEmail, otp))) {
    const attempted = await OtpVerification.findOneAndUpdate({ _id: record._id, consumedAt: null, attempts: { $lt: record.maxAttempts } }, { $inc: { attempts: 1 } }, { new: true });
    if (!attempted) throw new ApiError("Too many incorrect attempts. Request a new code.", 429, [{ code: "OTP_ATTEMPTS_EXCEEDED" }]);
    if (attempted.attempts >= attempted.maxAttempts) await OtpVerification.updateOne({ _id: attempted._id, consumedAt: null }, { $set: { consumedAt: new Date() } });
    throw new ApiError("That code is incorrect or expired.", 400, [{ code: "OTP_INVALID", attemptsRemaining: Math.max(0, attempted.maxAttempts - attempted.attempts) }]);
  }
  const consumed = await OtpVerification.findOneAndUpdate({ _id: record._id, consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: record.maxAttempts } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!consumed) throw new ApiError("This code has expired or was already used.", 400, [{ code: "OTP_EXPIRED" }]);
  let user = await User.findOne({ email: normalizedEmail });
  if (!user && purpose === "signup") {
    try { user = await User.create({ name: record.fullName, email: normalizedEmail, emailVerified: true, role: "user" }); }
    catch (error) { if (error?.code === 11000) user = await User.findOne({ email: normalizedEmail }); else throw error; }
  }
  if (!user || user.role !== "user" || user.isDisabled) throw new ApiError("Unable to verify this customer account.", 403);
  user.emailVerified = true;
  pushLoginHistory(user, req, purpose === "signup" ? "signup_email_otp" : "login_email_otp");
  const session = await issueSession(user, undefined, req);
  return { ...session, user: publicCustomer(user) };
}

export async function authenticateWithGoogle(credential, req) {
  if (!env.google.clientId) throw new ApiError("Google sign-in is not configured.", 503, [{ code: "GOOGLE_AUTH_NOT_CONFIGURED" }]);
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.google.clientId });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError("Google sign-in could not be verified.", 401, [{ code: "GOOGLE_TOKEN_INVALID" }]);
  }
  const email = normalizeCustomerEmail(payload?.email);
  const googleSub = String(payload?.sub || "");
  if (!email || !googleSub || payload?.email_verified !== true) throw new ApiError("Google account email is not verified.", 401, [{ code: "GOOGLE_EMAIL_UNVERIFIED" }]);
  let user = await User.findOne({ email }).select("+googleSub");
  if (user?.role === "admin" || user?.isDisabled) throw new ApiError("Unable to authenticate this customer account.", 403);
  if (user?.googleSub && user.googleSub !== googleSub) throw new ApiError("This email is linked to another Google account.", 409, [{ code: "GOOGLE_ACCOUNT_MISMATCH" }]);
  if (!user) user = await User.create({ name: String(payload.name || email.split("@")[0]).trim(), email, emailVerified: true, googleSub, role: "user" });
  else {
    user.googleSub = googleSub;
    user.emailVerified = true;
  }
  pushLoginHistory(user, req, "google_signin");
  const session = await issueSession(user, undefined, req);
  return { ...session, user: publicCustomer(user) };
}

export async function refreshUserSession(refreshToken, req) { if (!refreshToken) throw new ApiError("Refresh token is required.", 401); const decoded = verifyToken(refreshToken); if (decoded.type !== "refresh") throw new ApiError("Invalid refresh token.", 401); const user = await User.findById(decoded.id).select("+sessions.refreshTokenHash"); if (!user || user.isDisabled) throw new ApiError("Session expired.", 401); if (user.role === "admin") { const active = await findAdminSessionByRefresh(user._id, decoded.sessionId, refreshToken); if (!active) throw new ApiError("Session expired.", 401); const token = signToken(user._id, active.sessionId), nextRefreshToken = signRefreshToken(user._id, active.sessionId); await attachRefreshToken(active.sessionId, nextRefreshToken); return { user, token, refreshToken: nextRefreshToken }; } const active = findSessionByRefresh(user, refreshToken); if (!active) throw new ApiError("Session expired.", 401); revokeSession(user, active.sessionId); return issueSession(user, undefined, req); }
export async function logoutUser(userId, id) { const user = await User.findById(userId); if (!user) return; if (user.role === "admin") await revokeAdminSessions(userId, [id], "logout"); else { revokeSession(user, id); await user.save({ validateBeforeSave: false }); } }
export async function updateUserProfile(userId, payload) { const update = {}; if (payload.name) update.name = String(payload.name).trim(); if (typeof payload.whatsappOptIn === "boolean") update.whatsappOptIn = payload.whatsappOptIn; return User.findByIdAndUpdate(userId, update, { new: true, runValidators: true }); }
export async function getSecuritySummary(userId) { const user = await User.findById(userId); return { emailVerified: user.emailVerified, sessions: (user.sessions || []).filter((session) => !session.revokedAt && session.expiresAt > new Date()), loginHistory: (user.loginHistory || []).slice(0, 20) }; }
export async function revokeUserSession(userId, id) { const user = await User.findById(userId); revokeSession(user, id); await user.save({ validateBeforeSave: false }); return getSecuritySummary(userId); }
export async function addAddress(userId, payload) { const user = await User.findById(userId); if (payload.isDefault) user.addresses.forEach((address) => { address.isDefault = false; }); user.addresses.push(payload); await user.save(); return user.addresses; }
export async function updateAddress(userId, addressId, payload) { const user = await User.findById(userId); const address = user.addresses.id(addressId); if (!address) throw new ApiError("Address not found.", 404); if (payload.isDefault) user.addresses.forEach((item) => { item.isDefault = false; }); address.set(payload); await user.save(); return user.addresses; }
export async function deleteAddress(userId, addressId) { const user = await User.findById(userId); const address = user.addresses.id(addressId); if (!address) throw new ApiError("Address not found.", 404); address.deleteOne(); await user.save(); return user.addresses; }
