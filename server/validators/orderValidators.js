// Validation chains for order routes.
import { body, param } from "express-validator";

export const orderIdValidator = [param("id").isMongoId().withMessage("Valid order id is required.")];

export const createOrderValidator = [
  body("products").isArray({ min: 1 }).withMessage("At least one product is required."),
  body("products.*.product").isMongoId().withMessage("Valid product id is required."),
  body("products.*.variantId").isMongoId().withMessage("Valid variant id is required."),
  body("products.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1."),
  body("shippingAddress.fullName").trim().notEmpty().withMessage("Full name is required."),
  body("shippingAddress.phone").trim().notEmpty().withMessage("Phone is required."),
  body("shippingAddress.street").trim().notEmpty().withMessage("Street is required."),
  body("shippingAddress.city").trim().notEmpty().withMessage("City is required."),
  body("shippingAddress.state").trim().notEmpty().withMessage("State is required."),
  body("shippingAddress.postalCode").trim().notEmpty().withMessage("Postal code is required."),
  body("paymentMethod").optional().isIn(["cod", "razorpay", "card", "upi"]).withMessage("Invalid payment method."),
];

export const updateOrderStatusValidator = [
  body("orderStatus").isIn(["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"]).withMessage("Invalid order status."),
  body("paymentStatus").optional().isIn(["pending", "paid", "failed", "refunded"]).withMessage("Invalid payment status."),
];
