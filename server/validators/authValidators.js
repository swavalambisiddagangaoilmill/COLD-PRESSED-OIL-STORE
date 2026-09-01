import { body, param } from "express-validator";

const email = body("email").trim().isLength({ max: 254 }).isEmail().withMessage("Enter a valid email address.").normalizeEmail({ gmail_remove_dots: false });
export const requestOtpValidator = [email, body("purpose").isIn(["signup", "login"]).withMessage("Invalid authentication purpose."), body("name").optional().trim().isLength({ min: 2, max: 100 }).withMessage("Enter your full name.")];
export const verifyOtpValidator = [email, body("purpose").isIn(["signup", "login"]).withMessage("Invalid authentication purpose."), body("otp").matches(/^\d{6}$/).withMessage("Enter the 6-digit code.")];
export const updateProfileValidator = [body("name").optional().trim().isLength({ min: 2, max: 100 }).withMessage("Enter your full name."), body("whatsappOptIn").optional().isBoolean().toBoolean()];
export const sessionIdValidator = [param("sessionId").notEmpty().withMessage("Session id is required.")];
export const addressValidator = [body("fullName").trim().notEmpty().withMessage("Full name is required."), body("phone").trim().notEmpty().withMessage("Phone is required."), body("street").trim().notEmpty().withMessage("Street is required."), body("city").trim().notEmpty().withMessage("City is required."), body("state").trim().notEmpty().withMessage("State is required."), body("postalCode").trim().notEmpty().withMessage("Postal code is required.")];
export const addressIdValidator = [param("addressId").isMongoId().withMessage("Valid address id is required.")];
