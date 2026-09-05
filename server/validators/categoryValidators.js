// Validation chains for category routes.
import { body, param } from "express-validator";
import { PRODUCT_CATEGORIES } from "../../shared/productCategories.js";

export const categoryIdValidator = [param("id").isMongoId().withMessage("Valid category id is required.")];

const categoryFields = [
  body("description").optional({ nullable: true }).trim(),
  body("isActive").optional().isBoolean().withMessage("Category status must be true or false."),
];

export const categoryCreateValidator = [
  body("name").trim().isIn(PRODUCT_CATEGORIES).withMessage("Category must be one of the 14 canonical categories."),
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  ...categoryFields,
];

export const categoryUpdateValidator = [
  body("name").trim().notEmpty().withMessage("Category name is required.").isLength({ max: 120 }).withMessage("Category name must be 120 characters or fewer."),
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  ...categoryFields,
];

export const categoryValidator = categoryCreateValidator;
