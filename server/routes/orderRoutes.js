// Order route registration.
import { Router } from "express";
import { createOrderHandler, getAllOrdersHandler, getMyOrdersHandler, getOrderHandler, getOrderTrackingHandler, getShippingQuoteHandler, updateOrderStatusHandler } from "../controllers/orderController.js";
import { adminOnly } from "../middleware/admin.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createOrderValidator, orderIdValidator, shippingQuoteValidator, updateOrderStatusValidator } from "../validators/orderValidators.js";

const router = Router();

router.post("/shipping-quote", protect, shippingQuoteValidator, validate, getShippingQuoteHandler);
router.post("/", protect, createOrderValidator, validate, createOrderHandler);
router.get("/my", protect, getMyOrdersHandler);
router.get("/", protect, adminOnly, getAllOrdersHandler);
router.get("/:id/tracking", protect, orderIdValidator, validate, getOrderTrackingHandler);
router.get("/:id", protect, orderIdValidator, validate, getOrderHandler);
router.put("/:id/status", protect, adminOnly, orderIdValidator, updateOrderStatusValidator, validate, updateOrderStatusHandler);

export default router;

