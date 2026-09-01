// Auth route registration.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  addAddressHandler,
  changePassword,
  deleteAddressHandler,
  forgotPassword,
  getProfile,
  getSecurityHandler,
  google,
  login,
  continueAdminLogin,
  logout,
  refresh,
  requestOtpHandler,
  resetPasswordHandler,
  revokeAllSessionsHandler,
  revokeSessionHandler,
  updateAddressHandler,
  updateProfile,
  requestCustomerOtp,
  verifyCustomerOtp,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  addressIdValidator,
  addressValidator,
  changePasswordValidator,
  continueAdminLoginValidator,
  forgotPasswordValidator,
  googleValidator,
  loginValidator,
  otpRequestValidator,
  refreshValidator,
  resetPasswordValidator,
  sessionIdValidator,
  updateProfileValidator,
  customerOtpRequestValidator,
  customerOtpVerifyValidator,
} from "../validators/authValidators.js";

const router = Router();


const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many authentication attempts.", errors: [] } });
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many security attempts.", errors: [] } });
const customerOtpRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: true, message: "If the email can receive a code, it has been sent.", data: {} } });
const customerOtpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many verification attempts.", errors: [] } });


router.post("/login", authLimiter, loginValidator, validate, login);
router.post("/google", authLimiter, googleValidator, validate, google);
router.post("/otp/request", customerOtpRequestLimiter, customerOtpRequestValidator, validate, requestCustomerOtp);
router.post("/otp/verify", customerOtpVerifyLimiter, customerOtpVerifyValidator, validate, verifyCustomerOtp);
router.post("/admin-login/continue", authLimiter, continueAdminLoginValidator, validate, continueAdminLogin);
router.post("/refresh", authLimiter, refreshValidator, validate, refresh);
router.post("/logout", protect, logout);
router.post("/forgot-password", sensitiveLimiter, forgotPasswordValidator, validate, forgotPassword);
router.post("/reset-password/:token", sensitiveLimiter, resetPasswordValidator, validate, resetPasswordHandler);
router.post("/otp/security-code", protect, sensitiveLimiter, otpRequestValidator, validate, requestOtpHandler);
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfileValidator, validate, updateProfile);
router.get("/security", protect, getSecurityHandler);
router.delete("/sessions", protect, revokeAllSessionsHandler);
router.delete("/sessions/:sessionId", protect, sessionIdValidator, validate, revokeSessionHandler);
router.put("/change-password", protect, sensitiveLimiter, changePasswordValidator, validate, changePassword);
router.post("/addresses", protect, addressValidator, validate, addAddressHandler);
router.put("/addresses/:addressId", protect, addressIdValidator, addressValidator, validate, updateAddressHandler);
router.delete("/addresses/:addressId", protect, addressIdValidator, validate, deleteAddressHandler);

export default router;
