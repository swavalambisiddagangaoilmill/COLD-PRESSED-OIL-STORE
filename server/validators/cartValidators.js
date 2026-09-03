// Validation chains for cart routes.
import { body, param, query } from "express-validator";

export const cartItemValidator = [
  body("productId").isMongoId().withMessage("Valid product id is required."),
  body("quantity").optional().isInt({ min: 1 }).withMessage("Quantity must be at least 1."),
  body("variantId").optional({ nullable: true }).isMongoId().withMessage("Valid variant id is required."),
];

export const cartSyncValidator = [
  body("items").isArray().withMessage("Items must be an array."),
  body("merge").optional().isBoolean().withMessage("Merge must be true or false."),
  body("items.*.productId").optional().isMongoId().withMessage("Valid product id is required."),
  body("items.*.product").optional().isMongoId().withMessage("Valid product id is required."),
  body("items.*.id").optional().isMongoId().withMessage("Valid product id is required."),
  body("items.*.quantity").optional().isInt({ min: 1 }).withMessage("Quantity must be at least 1."),
  body("items.*.variantId").optional({ nullable: true }).isMongoId().withMessage("Valid variant id is required."),
  body("items.*.variant").optional({ nullable: true }).isMongoId().withMessage("Valid variant id is required."),
];

export const cartParamValidator = [param("productId").isMongoId().withMessage("Valid product id is required.")];
export const cartVariantQueryValidator = [query("variantId").optional({ nullable: true }).isMongoId().withMessage("Valid variant id is required.")];
export const cartQuantityValidator = [body("quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1.")];
