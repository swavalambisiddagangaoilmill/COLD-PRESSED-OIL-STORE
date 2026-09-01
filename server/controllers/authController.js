import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { clearAuthCookies, setAuthCookie, setRefreshCookie } from "../utils/jwt.js";
import { addAddress, deleteAddress, getSecuritySummary, logoutUser, refreshUserSession, requestAuthOtp, revokeUserSession, updateAddress, updateUserProfile, verifyAuthOtp } from "../services/authService.js";

const setSession = (res, token, refreshToken) => { setAuthCookie(res, token); setRefreshCookie(res, refreshToken); };
export const requestOtp = asyncHandler(async (req, res) => sendSuccess(res, 200, "If the email is eligible, a verification code has been sent.", await requestAuthOtp(req.body, req)));
export const verifyOtp = asyncHandler(async (req, res) => { const result = await verifyAuthOtp(req.body, req); setSession(res, result.token, result.refreshToken); sendSuccess(res, 200, "Email verified", { user: result.user }); });
export const refresh = asyncHandler(async (req, res) => { const result = await refreshUserSession(req.cookies?.refreshToken, req); setSession(res, result.token, result.refreshToken); sendSuccess(res, 200, "Session refreshed", { user: result.user }); });
export const logout = asyncHandler(async (req, res) => { await logoutUser(req.user._id, req.authSessionId); clearAuthCookies(res); sendSuccess(res, 200, "Logged out successfully"); });
export const getProfile = asyncHandler(async (req, res) => sendSuccess(res, 200, "Profile fetched", { user: req.user }));
export const updateProfile = asyncHandler(async (req, res) => sendSuccess(res, 200, "Profile updated", { user: await updateUserProfile(req.user._id, req.body) }));
export const getSecurityHandler = asyncHandler(async (req, res) => sendSuccess(res, 200, "Security details fetched", { security: await getSecuritySummary(req.user._id) }));
export const revokeSessionHandler = asyncHandler(async (req, res) => sendSuccess(res, 200, "Session revoked", { security: await revokeUserSession(req.user._id, req.params.sessionId) }));
export const revokeAllSessionsHandler = asyncHandler(async (req, res) => { const security = await revokeUserSession(req.user._id); clearAuthCookies(res); sendSuccess(res, 200, "All sessions revoked", { security }); });
export const addAddressHandler = asyncHandler(async (req, res) => sendSuccess(res, 201, "Address added", { addresses: await addAddress(req.user._id, req.body) }));
export const updateAddressHandler = asyncHandler(async (req, res) => sendSuccess(res, 200, "Address updated", { addresses: await updateAddress(req.user._id, req.params.addressId, req.body) }));
export const deleteAddressHandler = asyncHandler(async (req, res) => sendSuccess(res, 200, "Address deleted", { addresses: await deleteAddress(req.user._id, req.params.addressId) }));
