// Authentication business logic.
import crypto from "crypto";
import User from "../models/User.js";
import CustomerAuthOtp from "../models/CustomerAuthOtp.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { normalizeIndianPhone } from "../utils/phone.js";
import { signRefreshToken, signToken, verifyToken } from "../utils/jwt.js";
import { assertAdminSessionCapacity, attachRefreshToken, createAdminSession } from "./adminSessionService.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { sendCustomerAuthOtpEmail, sendNewDeviceEmail, sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "./emailService.js";
import { verifyGoogleIdToken } from "./oauthService.js";
import { verifyTurnstile } from "./turnstileService.js";
import {
  assertLoginAllowed,
  createOtp,
  createPlainToken,
  findSessionByRefresh,
  getDeviceDetails,
  hashValue,
  isKnownDevice,
  loginNeedsTurnstile,
  pushLoginHistory,
  recordFailedLogin,
  resetLoginProtection,
  revokeSession,
  trustDevice,
  upsertSession,
  verifyOtp,
} from "./authSecurityService.js";

function hashToken(token) {
  return hashValue(token);
}

function createSessionId() {
  return crypto.randomUUID();
}

const customerOtpTtlMs = 5 * 60 * 1000;
const customerOtpCooldownMs = 50 * 1000;
const customerOtpWindowMs = 60 * 60 * 1000;
const customerOtpMaxRequests = 5;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function customerOtpHash(email, code) {
  return crypto.createHmac("sha256", env.jwtSecret).update(`${normalizeEmail(email)}:${code}`).digest("hex");
}

export async function requestCustomerAuthOtp(payload, req) {
  const email = normalizeEmail(payload.email);
  const now = new Date();
  const current = await CustomerAuthOtp.findOne({ email });
  const withinWindow = current?.requestWindowStartedAt && now - current.requestWindowStartedAt < customerOtpWindowMs;
  if (current?.lastSentAt && now - current.lastSentAt < customerOtpCooldownMs) return;
  if (withinWindow && current.requestCount >= customerOtpMaxRequests) return;

  const user = await User.findOne({ email }).select("role isDisabled");
  if (user?.role === "admin") return;

  const code = String(crypto.randomInt(100000, 1000000));
  const requestCount = withinWindow ? current.requestCount + 1 : 1;
  const requestWindowStartedAt = withinWindow ? current.requestWindowStartedAt : now;
  await CustomerAuthOtp.findOneAndUpdate(
    { email },
    { $set: { name: payload.name?.trim() || undefined, flow: payload.flow, codeHash: customerOtpHash(email, code), expiresAt: new Date(now.getTime() + customerOtpTtlMs), attempts: 0, maxAttempts: 5, lastSentAt: now, requestWindowStartedAt, requestCount, consumedAt: null, requestIpHash: hashValue(req?.ip || "unknown") } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await sendCustomerAuthOtpEmail(email, code);
}

export async function verifyCustomerAuthOtp(payload, req) {
  const email = normalizeEmail(payload.email);
  const record = await CustomerAuthOtp.findOne({ email }).select("+codeHash");
  if (!record || record.consumedAt || record.expiresAt <= new Date()) throw new ApiError("Verification code is invalid or expired.", 400, [{ code: "OTP_EXPIRED" }]);
  if (record.attempts >= record.maxAttempts) throw new ApiError("Too many verification attempts. Request a new code.", 429, [{ code: "OTP_RATE_LIMIT" }]);

  const codeHash = customerOtpHash(email, payload.otp);
  if (record.codeHash !== codeHash) {
    const updated = await CustomerAuthOtp.findOneAndUpdate({ _id: record._id, consumedAt: null, attempts: { $lt: record.maxAttempts } }, { $inc: { attempts: 1 } }, { new: true });
    if (updated?.attempts >= updated?.maxAttempts) throw new ApiError("Too many verification attempts. Request a new code.", 429, [{ code: "OTP_RATE_LIMIT" }]);
    throw new ApiError("Verification code is invalid or expired.", 400, [{ code: "OTP_INVALID" }]);
  }

  const consumed = await CustomerAuthOtp.findOneAndUpdate(
    { _id: record._id, codeHash, consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: record.maxAttempts } },
    { $set: { consumedAt: new Date() }, $unset: { codeHash: 1 } },
    { new: true }
  );
  if (!consumed) throw new ApiError("Verification code is invalid or expired.", 400, [{ code: "OTP_CONSUMED" }]);

  let user = await User.findOne({ email }).select("+sessions.refreshTokenHash");
  if (user?.role === "admin") throw new ApiError("Use admin login for this account.", 403);
  if (!user) {
    const name = record.name?.trim();
    if (!name) throw new ApiError("Create an account with your name before signing in.", 400, [{ code: "SIGNUP_REQUIRED" }]);
    try {
      user = await User.create({ name, email, emailVerified: true, role: "user" });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      user = await User.findOne({ email }).select("+sessions.refreshTokenHash");
    }
    await createAdminNotification({ category: "customers", type: "new_user_registration", title: "New User Registration", description: `${user.name} created an account.`, related: { kind: "User", id: user._id, label: user.email, path: "/admin/customers" } });
    await sendWelcomeEmail(user);
  }
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
  user.emailVerified = true;
  if (req) {
    trustDevice(user, req);
    pushLoginHistory(user, req, "email_otp_login");
  }
  return issueSession(user, undefined, req, true);
}

function publicSecurity(user) {
  const clean = user.toJSON ? user.toJSON() : user;
  return {
    emailVerified: Boolean(clean.emailVerified),
    googleLinked: Boolean((clean.oauthProviders || []).some((item) => item.provider === "google")),
    connectedProviders: clean.oauthProviders || [],
    sessions: (clean.sessions || []).filter((item) => !item.revokedAt && new Date(item.expiresAt) > new Date()),
    trustedDevices: clean.trustedDevices || [],
    passwordChangedAt: clean.passwordChangedAt,
    loginHistory: (clean.loginHistory || []).slice(0, 20),
  };
}

export async function issueSession(user, sessionId = createSessionId(), req = null, remember = false) {
  const token = signToken(user._id, sessionId);
  const refreshToken = signRefreshToken(user._id, sessionId);
  user.refreshToken = refreshToken;
  if (req) upsertSession(user, req, refreshToken, sessionId, remember);
  await user.save({ validateBeforeSave: false });
  user.refreshToken = undefined;
  return { user, token, refreshToken };
}

async function createEmailVerification(user) {
  const token = createPlainToken();
  user.emailVerificationToken = hashToken(token);
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  await sendVerificationEmail(user, token);
  return token;
}

export async function registerUser(payload, req) {
  await verifyTurnstile(payload.turnstileToken, req);
  const exists = await User.findOne({ email: payload.email });
  if (exists) throw new ApiError("Email is already registered.", 409);
  const user = new User({ name: payload.name, email: payload.email, phone: payload.phone ? normalizeIndianPhone(payload.phone) : undefined, password: payload.password, emailVerified: false });
  await createEmailVerification(user);
  if (req) {
    trustDevice(user, req);
    pushLoginHistory(user, req, "register");
  }
  await user.save();
  await createAdminNotification({ category: "customers", type: "new_user_registration", title: "New User Registration", description: `${user.name} created an account.`, related: { kind: "User", id: user._id, label: user.email, path: "/admin/customers" } });
  await sendWelcomeEmail(user);
  const issued = await issueSession(user, undefined, req, true);
  return issued;
}

export async function loginUser(email, password, req, options = {}) {
  const user = await User.findOne({ email }).select("+password +refreshToken +failedLoginAttempts +loginLockUntil +turnstileRequiredUntil +sessions.refreshTokenHash +otpRecords.codeHash +oauthProviders.providerId");
  if (!user) throw new ApiError("Invalid email or password.", 401);
  if (user.role !== "admin") throw new ApiError("Customer password login is unavailable. Use the email verification code.", 400, [{ code: "CUSTOMER_OTP_REQUIRED" }]);
  assertLoginAllowed(user);
  if (loginNeedsTurnstile(user)) await verifyTurnstile(options.turnstileToken || req.body.turnstileToken, req);
  if (!(await user.comparePassword(password))) {
    recordFailedLogin(user);
    if (req) pushLoginHistory(user, req, "failed_login");
    await user.save({ validateBeforeSave: false });
    throw new ApiError("Invalid email or password.", 401, loginNeedsTurnstile(user) ? [{ code: "TURNSTILE_REQUIRED" }] : []);
  }
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);

  if (req && user.role === "admin") {
    // Admin authentication never trusts a remembered device; existing entries
    // are cleared and every fresh login must complete the emailed OTP step.
    user.trustedDevices = [];
    if (!options.otpCode) {
      await createOtp(user, "new_device");
      pushLoginHistory(user, req, "admin_otp_required", { pendingOtp: true });
      await sendNewDeviceEmail(user, getDeviceDetails(req));
      await user.save({ validateBeforeSave: false });
      return { otpRequired: true, reason: "NEW_DEVICE", message: "Security code sent to your email." };
    }
    verifyOtp(user, "new_device", options.otpCode);
  } else if (req && !isKnownDevice(user, req)) {
    if (!options.otpCode) {
      await createOtp(user, "new_device");
      pushLoginHistory(user, req, "new_device_login", { pendingOtp: true });
      await sendNewDeviceEmail(user, getDeviceDetails(req));
      await user.save({ validateBeforeSave: false });
      return { otpRequired: true, reason: "NEW_DEVICE", message: "Security code sent to your email." };
    }
    verifyOtp(user, "new_device", options.otpCode);
    trustDevice(user, req);
  } else if (req && user.role !== "admin") {
    trustDevice(user, req);
  }

  if (req && user.role === "admin") await assertAdminSessionCapacity(req, user);
  const adminSession = req && user.role === "admin" ? await createAdminSession(req, user) : null;
  resetLoginProtection(user);
  if (req) pushLoginHistory(user, req, "login");
  const issued = await issueSession(user, adminSession?.sessionId, req, user.role === "admin" ? false : Boolean(options.remember));
  if (adminSession) await attachRefreshToken(adminSession.sessionId, issued.refreshToken);
  return { ...issued, adminSession };
}

export async function googleLogin(idToken, req, remember = true) {
  const profile = await verifyGoogleIdToken(idToken);
  let user;
  try {
    user = await User.findOne({ email: profile.email }).select("+oauthProviders.providerId +sessions.refreshTokenHash");
    if (!user) {
      user = new User({ name: profile.name, email: profile.email, emailVerified: profile.emailVerified, role: "user", oauthProviders: [{ provider: "google", providerId: profile.providerId, email: profile.email }] });
    } else if (user.role === "admin") {
      throw new ApiError("Use admin login for this account.", 403);
    } else if (!(user.oauthProviders || []).some((item) => item.provider === "google")) {
      user.oauthProviders.push({ provider: "google", providerId: profile.providerId, email: profile.email });
      if (profile.emailVerified) user.emailVerified = true;
    }
    if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
    if (req && !isKnownDevice(user, req)) {
      trustDevice(user, req);
      await sendNewDeviceEmail(user, getDeviceDetails(req));
    }
    if (req) pushLoginHistory(user, req, "google_login");
    await user.save({ validateBeforeSave: false });
  } catch (error) {
    throw error;
  }
  return issueSession(user, undefined, req, remember);
}

export async function refreshUserSession(refreshToken, req) {
  if (!refreshToken) throw new ApiError("Refresh token is required.", 401);
  const decoded = verifyToken(refreshToken);
  if (decoded.type !== "refresh") throw new ApiError("Invalid refresh token.", 401);
  const user = await User.findById(decoded.id).select("+refreshToken +sessions.refreshTokenHash");
  const session = user ? findSessionByRefresh(user, refreshToken) : null;
  if (!user || (user.refreshToken !== refreshToken && !session)) throw new ApiError("Invalid refresh token.", 401);
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
  if (req) pushLoginHistory(user, req, "refresh");
  return issueSession(user, decoded.sessionId || session?.sessionId, req, true);
}

export async function logoutUser(userId, sessionId) {
  if (!userId) return;
  const user = await User.findById(userId).select("+sessions.refreshTokenHash");
  if (!user) return;
  revokeSession(user, sessionId);
  user.refreshToken = undefined;
  pushLoginHistory(user, { ip: "", get: () => "" }, "logout");
  await user.save({ validateBeforeSave: false });
}

export async function updateUserProfile(userId, payload) {
  const allowed = ["name", "phone"];
  const updates = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)));
  if (updates.phone) updates.phone = normalizeIndianPhone(updates.phone);
  return User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true });
}
export async function changeUserPassword(user, currentPassword, nextPassword, otpCode) {
  if (user.role !== "admin") throw new ApiError("Customer accounts use email verification codes.", 400);
  const account = await User.findById(user._id).select("+password +refreshToken +sessions.refreshTokenHash +otpRecords.codeHash");
  if (!(await account.comparePassword(currentPassword))) throw new ApiError("Current password is incorrect.", 400);
  verifyOtp(account, "change_password", otpCode);
  account.password = nextPassword;
  account.refreshToken = undefined;
  revokeSession(account);
  await account.save();
  if (user.role === "admin") await createAdminNotification({ category: "security", type: "password_changed", title: "Admin Password Changed", description: `${user.email} changed their password.`, related: { kind: "User", id: user._id, label: user.email, path: "/admin/settings" } });
  return true;
}

export async function requestOtp(userId, purpose) {
  const user = await User.findById(userId).select("+otpRecords.codeHash");
  if (!user) throw new ApiError("User not found.", 404);
  if (purpose === "change_password" && user.role !== "admin") throw new ApiError("Customer accounts use email verification codes.", 400);
  await createOtp(user, purpose);
  await user.save({ validateBeforeSave: false });
  return true;
}

export async function requestPasswordReset(email, req) {
  if (req) await verifyTurnstile(req.body.turnstileToken, req);
  const user = await User.findOne({ email, role: "admin" }).select("+passwordResetToken +passwordResetExpires");
  if (!user) return null;
  const resetToken = createPlainToken();
  user.passwordResetToken = hashToken(resetToken);
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
  await user.save({ validateBeforeSave: false });
  await sendPasswordResetEmail(user, resetToken);
  return resetToken;
}

export async function resetPassword(resetToken, password) {
  const hashed = hashToken(resetToken);
  const user = await User.findOne({ role: "admin", $or: [{ passwordResetToken: hashed }, { passwordResetToken: resetToken }], passwordResetExpires: { $gt: Date.now() } }).select("+passwordResetToken +passwordResetExpires +sessions.refreshTokenHash");
  if (!user) throw new ApiError("Reset token is invalid or expired.", 400);
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  revokeSession(user);
  await user.save();
  return issueSession(user);
}

export async function verifyEmail(token) {
  const hashed = hashToken(token);
  const user = await User.findOne({ $or: [{ emailVerificationToken: hashed }, { emailVerificationToken: token }], emailVerificationExpires: { $gt: Date.now() } }).select("+emailVerificationToken +emailVerificationExpires");
  if (!user) throw new ApiError("Verification token is invalid or expired.", 400);
  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  return user;
}

export async function resendVerification(userId) {
  const user = await User.findById(userId).select("+emailVerificationToken +emailVerificationExpires");
  if (!user) throw new ApiError("User not found.", 404);
  if (user.emailVerified) return { user };
  await createEmailVerification(user);
  await user.save({ validateBeforeSave: false });
  return { user };
}

export async function getSecuritySummary(userId) {
  const user = await User.findById(userId).select("+oauthProviders.providerId +sessions.refreshTokenHash +otpRecords.codeHash");
  if (!user) throw new ApiError("User not found.", 404);
  return publicSecurity(user);
}

export async function revokeUserSession(userId, sessionId) {
  const user = await User.findById(userId).select("+sessions.refreshTokenHash");
  if (!user) throw new ApiError("User not found.", 404);
  revokeSession(user, sessionId);
  await user.save({ validateBeforeSave: false });
  return publicSecurity(user);
}

export async function addAddress(userId, address) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError("User not found.", 404);
  const cleanAddress = { ...address };
  if (cleanAddress.phone) cleanAddress.phone = normalizeIndianPhone(cleanAddress.phone);
  if (cleanAddress.isDefault) user.addresses.forEach((item) => { item.isDefault = false; });
  user.addresses.push(cleanAddress);
  await user.save();
  return user.addresses;
}
export async function updateAddress(userId, addressId, address) {
  const user = await User.findById(userId);
  const existing = user?.addresses.id(addressId);
  if (!existing) throw new ApiError("Address not found.", 404);
  const cleanAddress = { ...address };
  if (cleanAddress.phone) cleanAddress.phone = normalizeIndianPhone(cleanAddress.phone);
  if (cleanAddress.isDefault) user.addresses.forEach((item) => { item.isDefault = item._id.toString() === addressId; });
  existing.set(cleanAddress);
  await user.save();
  return user.addresses;
}
export async function deleteAddress(userId, addressId) {
  const user = await User.findById(userId);
  const existing = user?.addresses.id(addressId);
  if (!existing) throw new ApiError("Address not found.", 404);
  existing.deleteOne();
  await user.save();
  return user.addresses;
}
