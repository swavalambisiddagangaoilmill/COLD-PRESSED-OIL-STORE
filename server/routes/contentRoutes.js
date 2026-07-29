// Content route registration.
import { Router } from "express";
import { body } from "express-validator";
import { getActiveOffers, getFaqs, getGalleryImages, getPageContent, validateCoupon } from "../controllers/contentController.js";
import { optionalProtect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/offers", getActiveOffers);
router.post("/coupons/validate", optionalProtect, [body("code").trim().notEmpty().withMessage("Coupon code is required."), body("products").isArray({ min: 1 }).withMessage("Products are required for coupon validation.")], validate, validateCoupon);
router.get("/faqs", getFaqs);
router.get("/gallery", getGalleryImages);
router.get("/pages/:slug", getPageContent);

export default router;



