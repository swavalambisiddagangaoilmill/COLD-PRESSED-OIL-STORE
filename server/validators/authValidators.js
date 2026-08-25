import { body, param } from "express-validator";

const phone = body("phone").trim().notEmpty().withMessage("Mobile number is required.").matches(/^(?:\+91|91|0)?[6-9]\d{9}$/).withMessage("Enter a valid 10-digit Indian mobile number.");
export const requestOtpValidator = [phone, body("purpose").isIn(["signup", "login"]).withMessage("Invalid authentication purpose."), body("name").optional().trim().isLength({ min: 2, max: 100 }).withMessage("Enter your full name.")];
export const verifyOtpValidator = [phone, body("purpose").isIn(["signup", "login"]).withMessage("Invalid authentication purpose."), body("otp").matches(/^\d{6}$/).withMessage("Enter the 6-digit code.")];
export const updateProfileValidator = [body("name").optional().trim().isLength({ min: 2, max: 100 }).withMessage("Enter your full name."), body("whatsappOptIn").optional().isBoolean().toBoolean()];
export const sessionIdValidator = [param("sessionId").notEmpty().withMessage("Session id is required.")];
export const addressValidator = [body("fullName").trim().notEmpty().withMessage("Full name is required."), body("phone").trim().notEmpty().withMessage("Phone is required."), body("street").trim().notEmpty().withMessage("Street is required."), body("city").trim().notEmpty().withMessage("City is required."), body("state").trim().notEmpty().withMessage("State is required."), body("postalCode").trim().notEmpty().withMessage("Postal code is required.")];
export const addressIdValidator = [param("addressId").isMongoId().withMessage("Valid address id is required.")];
