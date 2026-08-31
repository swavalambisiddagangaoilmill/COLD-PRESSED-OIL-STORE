import crypto from "crypto";
import User from "../models/User.js";
import OtpVerification from "../models/OtpVerification.js";
import { ApiError } from "../utils/ApiError.js";
import { maskPhone, normalizeIndianPhone } from "../utils/phone.js";
import { signRefreshToken, signToken, verifyToken } from "../utils/jwt.js";
import { findSessionByRefresh, getDeviceFingerprint, hashValue, pushLoginHistory, revokeSession, upsertSession } from "./authSecurityService.js";
import { safeWhatsAppErrorDetails, sendOTP } from "./whatsappService.js";
import { attachRefreshToken, createAdminSession, findAdminSessionByRefresh, revokeAdminSessions } from "./adminSessionService.js";

const OTP_TTL_MS = 5 * 60 * 1000, RESEND_COOLDOWN_MS = 60 * 1000, PHONE_WINDOW_MS = 15 * 60 * 1000, PHONE_LIMIT = 5;
const requestHash = (value) => hashValue(String(value || "unknown"));

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

export async function requestAuthOtp({ phone, purpose, name }, req) {
  const phoneNumber = normalizeIndianPhone(phone);
  const existingUser = await User.findOne({ phone: phoneNumber });
  if (existingUser?.role === "admin") throw new ApiError("No customer account found with this mobile number.", 404, [{ code: "ACCOUNT_NOT_FOUND" }]);
  if (purpose === "signup" && existingUser) throw new ApiError("An account already exists with this mobile number. Please log in.", 409, [{ code: "ACCOUNT_EXISTS" }]);
  if (purpose === "login" && !existingUser) throw new ApiError("No account found with this mobile number. Please create an account.", 404, [{ code: "ACCOUNT_NOT_FOUND" }]);
  if (purpose === "signup" && String(name || "").trim().length < 2) throw new ApiError("Enter your full name.", 422);
  const recent = await OtpVerification.find({ phoneNumber, purpose, createdAt: { $gt: new Date(Date.now() - PHONE_WINDOW_MS) } }).sort({ createdAt: -1 }).lean();
  if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(recent[0].createdAt).getTime())) / 1000);
    throw new ApiError(`Please wait ${retryAfter} seconds before requesting another code.`, 429, [{ code: "OTP_COOLDOWN", retryAfter }]);
  }
  if (recent.length >= PHONE_LIMIT) throw new ApiError("Too many OTP requests. Please try again later.", 429, [{ code: "OTP_RATE_LIMIT" }]);
  await OtpVerification.updateMany({ phoneNumber, purpose, consumedAt: null }, { $set: { consumedAt: new Date() } });
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const record = await OtpVerification.create({ phoneNumber, purpose, fullName: purpose === "signup" ? String(name).trim() : undefined, otpHash: hashValue(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS), requestedByIpHash: requestHash(req.ip), requestedByDeviceHash: requestHash(getDeviceFingerprint(req)) });
  try { await sendOTP(phoneNumber, otp); } catch (error) {
    await OtpVerification.findByIdAndDelete(record._id);
    console.error("[WhatsApp OTP Error]", safeWhatsAppErrorDetails(error));
    throw new ApiError("Unable to send the WhatsApp code. Please try again.", 502, [{ code: "WHATSAPP_SEND_FAILED" }]);
  }
  return { phoneNumber: maskPhone(phoneNumber), purpose, expiresIn: 300, resendAfter: 60 };
}

export async function verifyAuthOtp({ phone, purpose, otp }, req) {
  const phoneNumber = normalizeIndianPhone(phone);
  const record = await OtpVerification.findOne({ phoneNumber, purpose, consumedAt: null }).sort({ createdAt: -1 }).select("+otpHash");
  if (!record || record.expiresAt <= new Date()) throw new ApiError("This code has expired. Request a new code.", 400, [{ code: "OTP_EXPIRED" }]);
  if (record.attempts >= record.maxAttempts) throw new ApiError("Too many incorrect attempts. Request a new code.", 429, [{ code: "OTP_ATTEMPTS_EXCEEDED" }]);
  record.attempts += 1;
  if (record.otpHash !== hashValue(otp)) { await record.save(); throw new ApiError("That code is incorrect. Try again.", 400, [{ code: "OTP_INVALID", attemptsRemaining: record.maxAttempts - record.attempts }]); }
  record.consumedAt = new Date(); await record.save();
  let user = await User.findOne({ phone: phoneNumber });
  if (purpose === "signup") {
    if (user) throw new ApiError("An account already exists with this mobile number. Please log in.", 409);
    try { user = await User.create({ name: record.fullName, phone: phoneNumber, phoneVerified: true, whatsappOptIn: false }); }
    catch (error) { if (error?.code === 11000) throw new ApiError("An account already exists with this mobile number. Please log in.", 409); throw error; }
  } else if (!user) throw new ApiError("No account found with this mobile number. Please create an account.", 404);
  if (user.role === "admin") throw new ApiError("Admin accounts must use the dedicated admin login.", 403);
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
  user.phoneVerified = true; pushLoginHistory(user, req, purpose === "signup" ? "signup_otp" : "login_otp");
  return issueSession(user, undefined, req);
}

export async function refreshUserSession(refreshToken, req) { if (!refreshToken) throw new ApiError("Refresh token is required.", 401); const decoded = verifyToken(refreshToken); if (decoded.type !== "refresh") throw new ApiError("Invalid refresh token.", 401); const user = await User.findById(decoded.id).select("+sessions.refreshTokenHash"); if (!user || user.isDisabled) throw new ApiError("Session expired.", 401); if (user.role === "admin") { const active = await findAdminSessionByRefresh(user._id, decoded.sessionId, refreshToken); if (!active) throw new ApiError("Session expired.", 401); const token = signToken(user._id, active.sessionId), nextRefreshToken = signRefreshToken(user._id, active.sessionId); await attachRefreshToken(active.sessionId, nextRefreshToken); return { user, token, refreshToken: nextRefreshToken }; } const active = findSessionByRefresh(user, refreshToken); if (!active) throw new ApiError("Session expired.", 401); revokeSession(user, active.sessionId); return issueSession(user, undefined, req); }
export async function logoutUser(userId, id) { const user = await User.findById(userId); if (!user) return; if (user.role === "admin") await revokeAdminSessions(userId, [id], "logout"); else { revokeSession(user, id); await user.save({ validateBeforeSave: false }); } }
export async function updateUserProfile(userId, payload) { const update = {}; if (payload.name) update.name = String(payload.name).trim(); if (typeof payload.whatsappOptIn === "boolean") update.whatsappOptIn = payload.whatsappOptIn; return User.findByIdAndUpdate(userId, update, { new: true, runValidators: true }); }
export async function getSecuritySummary(userId) { const user = await User.findById(userId); return { phoneVerified: user.phoneVerified, sessions: (user.sessions || []).filter((s) => !s.revokedAt && s.expiresAt > new Date()), loginHistory: (user.loginHistory || []).slice(0, 20) }; }
export async function revokeUserSession(userId, id) { const user = await User.findById(userId); revokeSession(user, id); await user.save({ validateBeforeSave: false }); return getSecuritySummary(userId); }
export async function addAddress(userId, payload) { const user = await User.findById(userId); if (payload.isDefault) user.addresses.forEach((a) => { a.isDefault = false; }); user.addresses.push(payload); await user.save(); return user.addresses; }
export async function updateAddress(userId, addressId, payload) { const user = await User.findById(userId); const address = user.addresses.id(addressId); if (!address) throw new ApiError("Address not found.", 404); if (payload.isDefault) user.addresses.forEach((a) => { a.isDefault = false; }); address.set(payload); await user.save(); return user.addresses; }
export async function deleteAddress(userId, addressId) { const user = await User.findById(userId); const address = user.addresses.id(addressId); if (!address) throw new ApiError("Address not found.", 404); address.deleteOne(); await user.save(); return user.addresses; }
