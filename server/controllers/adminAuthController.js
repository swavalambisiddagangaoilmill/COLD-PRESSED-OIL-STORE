// HTTP controller for the dedicated admin authentication flow.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { setAuthCookie, setRefreshCookie } from "../utils/jwt.js";
import { loginAdmin } from "../services/adminAuthService.js";
import { precheckAdminLogin, recordAdminLoginFailure, recordAdminLoginSuccess } from "../services/adminLoginProtectionService.js";

export const adminLogin = asyncHandler(async (req, res) => {
  req.body.adminMode = true;
  const protection = await precheckAdminLogin(req);
  try {
    const result = await loginAdmin(req.body, req);
    if (result.otpRequired) return sendSuccess(res, 202, result.message, result);
    await recordAdminLoginSuccess(req, protection.record, result.user);
    setAuthCookie(res, result.token);
    setRefreshCookie(res, result.refreshToken);
    return sendSuccess(res, 200, "Admin logged in successfully", { user: result.user });
  } catch (error) {
    if (!error.errors?.some((item) => item.code === "ADMIN_SESSION_LIMIT")) await recordAdminLoginFailure(req, protection.record);
    throw error;
  }
});
