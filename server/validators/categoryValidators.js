// Validation chains for category routes.
import { body, param } from "express-validator";
import { PRODUCT_CATEGORIES } from "../../shared/productCategories.js";

export const categoryIdValidator = [param("id").isMongoId().withMessage("Valid category id is required.")];

export const categoryValidator = [
  body("name").trim().isIn(PRODUCT_CATEGORIES).withMessage("Category must be one of the 16 canonical categories."),
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  body("image").optional({ values: "falsy" }).trim().isURL().withMessage("Image must be a URL."),
  body("description").optional().trim(),
  body("isActive").optional().isBoolean().withMessage("Category status must be true or false."),
];
