// Auth controller exposes account and session endpoints.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { clearAuthCookies, setAuthCookie, setRefreshCookie } from "../utils/jwt.js";
import { logSecurityEvent } from "../services/securityEventService.js";
import { continuePendingAdminLogin, attachRefreshToken, revokeAdminSessions } from "../services/adminSessionService.js";
import { createAdminNotification } from "../services/adminNotificationService.js";
import { precheckAdminLogin, recordAdminLoginFailure, recordAdminLoginSuccess } from "../services/adminLoginProtectionService.js";
import {
  addAddress,
  changeUserPassword,
  deleteAddress,
  getSecuritySummary,
  googleLogin,
  issueSession,
  loginUser,
  logoutUser,
  refreshUserSession,
  registerUser,
  requestOtp,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  revokeUserSession,
  updateAddress,
  updateUserProfile,
  verifyEmail,
} from "../services/authService.js";

function setSession(res, token, refreshToken) {
  setAuthCookie(res, token);
  setRefreshCookie(res, refreshToken);
}

export const register = asyncHandler(async (req, res) => {
  const { user, token, refreshToken } = await registerUser(req.body, req);
  setSession(res, token, refreshToken);
  sendSuccess(res, 201, "Registered successfully", { user, token, refreshToken });
});

export const login = asyncHandler(async (req, res) => {
  const adminProtection = await precheckAdminLogin(req);
  try {
    const result = await loginUser(req.body.email, req.body.password, req, { remember: req.body.remember, turnstileToken: req.body.turnstileToken, otpCode: req.body.otpCode });
    if (result.otpRequired) return sendSuccess(res, 202, result.message, result);
    const { user, token, refreshToken } = result;
    if (adminProtection.protected && user.role === "admin") await recordAdminLoginSuccess(req, adminProtection.record, user);
    setSession(res, token, refreshToken);
    sendSuccess(res, 200, "Logged in successfully", { user, token, refreshToken });
  } catch (error) {
    await logSecurityEvent(req, "failed_login", { email: req.body.email }, "medium");
    if (adminProtection.protected) {
      await recordAdminLoginFailure(req, adminProtection.record);
      await createAdminNotification({ category: "security", type: "failed_admin_login", title: "Failed Admin Login", description: "A protected admin login attempt failed for " + (req.body.email || "an admin account") + ".", dedupeKey: "failed-admin-login:" + req.ip + ":" + req.body.email + ":" + new Date().toISOString().slice(0, 13), related: { kind: "Security", label: req.ip, path: "/admin/audit-logs" } });
    }
    throw error;
  }
});

export const google = asyncHandler(async (req, res) => {
  const { user, token, refreshToken } = await googleLogin(req.body.credential || req.body.idToken, req, req.body.remember !== false);
  setSession(res, token, refreshToken);
  sendSuccess(res, 200, "Google login successful", { user, token, refreshToken });
});


export const continueAdminLogin = asyncHandler(async (req, res) => {
  const { admin, session } = await continuePendingAdminLogin(req, req.body.pendingToken, req.body.revokeSessionIds || []);
  const { user, token, refreshToken } = await issueSession(admin, session.sessionId, req, true);
  await attachRefreshToken(session.sessionId, refreshToken);
  setSession(res, token, refreshToken);
  sendSuccess(res, 200, "Admin login continued", { user, token, refreshToken });
});

export const refresh = asyncHandler(async (req, res) => {
  const { user, token, refreshToken } = await refreshUserSession(req.cookies?.refreshToken || req.body.refreshToken, req);
  setSession(res, token, refreshToken);
  sendSuccess(res, 200, "Session refreshed successfully", { user, token, refreshToken });
});

export const logout = asyncHandler(async (req, res) => {
  if (req.user?.role === "admin") {
    await revokeAdminSessions(req.user._id, req.authSessionId ? [req.authSessionId] : [], "logout");
    await createAdminNotification({ category: "security", type: "admin_logout", title: "Admin Logout", description: `${req.user.email} signed out.`, related: { kind: "User", id: req.user._id, label: req.user.email, path: "/admin/settings" } });
  }
  await logoutUser(req.user?._id, req.authSessionId);
  clearAuthCookies(res);
  sendSuccess(res, 200, "Logged out successfully");
});

export const getProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, "Profile fetched successfully", { user: req.user });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await updateUserProfile(req.user._id, req.body);
  sendSuccess(res, 200, "Profile updated successfully", { user });
});

export const changePassword = asyncHandler(async (req, res) => {
  await changeUserPassword(req.user, req.body.currentPassword, req.body.password, req.body.otpCode);
  if (req.user?.role === "admin") await revokeAdminSessions(req.user._id, [], "password_change");
  clearAuthCookies(res);
  sendSuccess(res, 200, "Password changed successfully");
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await requestPasswordReset(req.body.email, req);
  sendSuccess(res, 200, "Password reset request accepted");
});

export const resetPasswordHandler = asyncHandler(async (req, res) => {
  const { user, token, refreshToken } = await resetPassword(req.params.token, req.body.password);
  setSession(res, token, refreshToken);
  sendSuccess(res, 200, "Password reset successfully", { user, token, refreshToken });
});

export const verifyEmailHandler = asyncHandler(async (req, res) => {
  const user = await verifyEmail(req.params.token);
  sendSuccess(res, 200, "Email verified successfully", { user });
});

export const resendVerificationHandler = asyncHandler(async (req, res) => {
  const data = await resendVerification(req.user._id);
  sendSuccess(res, 200, "Verification email sent", data);
});

export const requestOtpHandler = asyncHandler(async (req, res) => {
  await requestOtp(req.user._id, req.body.purpose);
  sendSuccess(res, 200, "Security code sent");
});

export const getSecurityHandler = asyncHandler(async (req, res) => {
  const security = await getSecuritySummary(req.user._id);
  sendSuccess(res, 200, "Security details fetched", { security });
});

export const revokeSessionHandler = asyncHandler(async (req, res) => {
  const security = await revokeUserSession(req.user._id, req.params.sessionId);
  sendSuccess(res, 200, "Session revoked", { security });
});

export const revokeAllSessionsHandler = asyncHandler(async (req, res) => {
  const security = await revokeUserSession(req.user._id);
  clearAuthCookies(res);
  sendSuccess(res, 200, "All sessions revoked", { security });
});

export const addAddressHandler = asyncHandler(async (req, res) => {
  const addresses = await addAddress(req.user._id, req.body);
  sendSuccess(res, 201, "Address added successfully", { addresses });
});

export const updateAddressHandler = asyncHandler(async (req, res) => {
  const addresses = await updateAddress(req.user._id, req.params.addressId, req.body);
  sendSuccess(res, 200, "Address updated successfully", { addresses });
});

export const deleteAddressHandler = asyncHandler(async (req, res) => {
  const addresses = await deleteAddress(req.user._id, req.params.addressId);
  sendSuccess(res, 200, "Address deleted successfully", { addresses });
});
