// Authentication business logic.
import crypto from "crypto";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { normalizeIndianPhone } from "../utils/phone.js";
import { signRefreshToken, signToken, verifyToken } from "../utils/jwt.js";
import { assertAdminSessionCapacity, attachRefreshToken, createAdminSession } from "./adminSessionService.js";
import { createAdminNotification } from "./adminNotificationService.js";
import { sendNewDeviceEmail, sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "./emailService.js";
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
  assertLoginAllowed(user);
  if (loginNeedsTurnstile(user)) await verifyTurnstile(options.turnstileToken || req.body.turnstileToken, req);
  if (!(await user.comparePassword(password))) {
    recordFailedLogin(user);
    if (req) pushLoginHistory(user, req, "failed_login");
    await user.save({ validateBeforeSave: false });
    throw new ApiError("Invalid email or password.", 401, loginNeedsTurnstile(user) ? [{ code: "TURNSTILE_REQUIRED" }] : []);
  }
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);

  const skipAdminEmailVerification = process.env.NODE_ENV !== "production" && user.role === "admin";
  if (req && !isKnownDevice(user, req)) {
    if (!skipAdminEmailVerification && !options.otpCode) {
      await createOtp(user, "new_device");
      pushLoginHistory(user, req, "new_device_login", { pendingOtp: true });
      await sendNewDeviceEmail(user, getDeviceDetails(req));
      await user.save({ validateBeforeSave: false });
      return { otpRequired: true, reason: "NEW_DEVICE", message: "Security code sent to your email." };
    }
    if (!skipAdminEmailVerification) verifyOtp(user, "new_device", options.otpCode);
    trustDevice(user, req);
  } else if (req) {
    trustDevice(user, req);
  }

  if (req && user.role === "admin") await assertAdminSessionCapacity(req, user);
  const adminSession = req && user.role === "admin" ? await createAdminSession(req, user) : null;
  resetLoginProtection(user);
  if (req) pushLoginHistory(user, req, "login");
  const issued = await issueSession(user, adminSession?.sessionId, req, Boolean(options.remember));
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
  await createOtp(user, purpose);
  await user.save({ validateBeforeSave: false });
  return true;
}

export async function requestPasswordReset(email, req) {
  if (req) await verifyTurnstile(req.body.turnstileToken, req);
  const user = await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires");
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
  const user = await User.findOne({ $or: [{ passwordResetToken: hashed }, { passwordResetToken: resetToken }], passwordResetExpires: { $gt: Date.now() } }).select("+passwordResetToken +passwordResetExpires +sessions.refreshTokenHash");
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
