// Public endpoint for dedicated admin login only.
import { Router } from "express";
import { body } from "express-validator";
import { adminLogin } from "../controllers/adminAuthController.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const validator = [body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid admin email."), body("password").isString().isLength({ min: 6, max: 200 }).withMessage("Enter the admin password."), body("otpCode").optional().matches(/^\d{6}$/).withMessage("Enter the 6-digit email security code.")];

router.post("/login", validator, validate, adminLogin);

export default router;
