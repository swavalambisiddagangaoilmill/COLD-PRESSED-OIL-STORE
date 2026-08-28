// Payment route registration.
import { Router } from "express";
import { createPaymentIntent, verifyPayment } from "../controllers/paymentController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { paymentIntentValidator, paymentVerifyValidator } from "../validators/paymentValidators.js";

const router = Router();

router.post("/intent", protect, paymentIntentValidator, validate, createPaymentIntent);
router.post("/verify", protect, paymentVerifyValidator, validate, verifyPayment);

export default router;

