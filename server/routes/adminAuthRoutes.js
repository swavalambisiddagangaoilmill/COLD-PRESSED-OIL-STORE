// Public, rate-limited endpoint for dedicated admin login only.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { adminLogin } from "../controllers/adminAuthController.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many admin authentication attempts.", errors: [] } });
const validator = [body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid admin email."), body("password").isString().isLength({ min: 6, max: 200 }).withMessage("Enter the admin password."), body("otpCode").optional().matches(/^\d{6}$/).withMessage("Enter the 6-digit email security code.")];

router.post("/login", limiter, validator, validate, adminLogin);

export default router;
