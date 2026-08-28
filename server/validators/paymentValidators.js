// Validation chains for Cashfree payment routes.
import { body } from "express-validator";

const orderValidator = [
  body("order.products").isArray({ min: 1 }).withMessage("At least one product is required."),
  body("order.products.*.product").isMongoId().withMessage("Valid product id is required."),
  body("order.products.*.variantId").isMongoId().withMessage("Valid variant id is required."),
  body("order.products.*.quantity").isInt({ min: 1, max: 1000 }).withMessage("Quantity must be between 1 and 1000."),
  body("order.shippingAddress.fullName").trim().notEmpty().withMessage("Full name is required."),
  body("order.shippingAddress.phone").trim().notEmpty().withMessage("Phone is required."),
  body("order.shippingAddress.street").trim().notEmpty().withMessage("Street is required."),
  body("order.shippingAddress.city").trim().notEmpty().withMessage("City is required."),
  body("order.shippingAddress.state").trim().notEmpty().withMessage("State is required."),
  body("order.shippingAddress.postalCode").trim().notEmpty().withMessage("Postal code is required."),
];

export const paymentIntentValidator = orderValidator;
export const paymentVerifyValidator = [body("checkoutId").isMongoId().withMessage("Valid checkout id is required.")];
