// Dedicated admin email, password, and email-OTP authentication.
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { issueSession } from "./authService.js";
import { assertLoginAllowed, createAdminOtp, pushLoginHistory, recordFailedLogin, resetLoginProtection, verifyAdminOtp } from "./authSecurityService.js";

export async function loginAdmin({ email, password, otpCode }, req) {
  const admin = await User.findOne({ email: String(email || "").trim().toLowerCase(), role: "admin" }).select("+password +failedLoginAttempts +loginLockUntil +turnstileRequiredUntil +otpRecords.codeHash");
  if (!admin) throw new ApiError("Unable to sign in with those credentials.", 401);
  assertLoginAllowed(admin);
  if (!(await admin.comparePassword(password))) {
    recordFailedLogin(admin);
    pushLoginHistory(admin, req, "failed_admin_login");
    await admin.save({ validateBeforeSave: false });
    throw new ApiError("Unable to sign in with those credentials.", 401);
  }
  if (admin.isDisabled) throw new ApiError("This account is disabled.", 403);
  if (!otpCode) {
    await createAdminOtp(admin);
    pushLoginHistory(admin, req, "admin_otp_required");
    await admin.save({ validateBeforeSave: false });
    return { otpRequired: true, message: "Security code sent to your admin email." };
  }
  try {
    verifyAdminOtp(admin, otpCode);
  } catch (error) {
    await admin.save({ validateBeforeSave: false });
    throw error;
  }
  resetLoginProtection(admin);
  pushLoginHistory(admin, req, "admin_login");
  return issueSession(admin, undefined, req);
}
