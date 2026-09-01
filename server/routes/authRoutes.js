import { Router } from "express";
import rateLimit from "express-rate-limit";
import { addAddressHandler, deleteAddressHandler, getProfile, getSecurityHandler, googleLogin, logout, refresh, requestOtp, revokeAllSessionsHandler, revokeSessionHandler, updateAddressHandler, updateProfile, verifyOtp } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { addressIdValidator, addressValidator, requestOtpValidator, sessionIdValidator, updateProfileValidator, verifyOtpValidator } from "../validators/authValidators.js";

const router = Router();
const generationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.ip, message: { success: false, message: "Too many OTP requests. Please try again later.", errors: [{ code: "OTP_RATE_LIMIT" }] } });
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many verification attempts. Please try again later.", errors: [{ code: "OTP_RATE_LIMIT" }] } });

router.post("/otp/request", generationLimiter, requestOtpValidator, validate, requestOtp);
router.post("/otp/verify", verificationLimiter, verifyOtpValidator, validate, verifyOtp);
router.post("/google", verificationLimiter, [body("credential").isString().isLength({ min: 100, max: 5000 }).withMessage("Valid Google credential is required.")], validate, googleLogin);
router.post("/refresh", refresh);
router.post("/logout", protect, logout);
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfileValidator, validate, updateProfile);
router.get("/security", protect, getSecurityHandler);
router.delete("/sessions", protect, revokeAllSessionsHandler);
router.delete("/sessions/:sessionId", protect, sessionIdValidator, validate, revokeSessionHandler);
router.post("/addresses", protect, addressValidator, validate, addAddressHandler);
router.put("/addresses/:addressId", protect, addressIdValidator, addressValidator, validate, updateAddressHandler);
router.delete("/addresses/:addressId", protect, addressIdValidator, validate, deleteAddressHandler);

export default router;
