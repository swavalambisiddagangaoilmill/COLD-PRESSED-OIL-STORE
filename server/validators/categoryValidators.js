// Validation chains for category routes.
import { body, param } from "express-validator";

export const categoryIdValidator = [param("id").isMongoId().withMessage("Valid category id is required.")];

const categoryFields = [
  body("description").optional({ nullable: true }).trim(),
  body("isActive").optional().isBoolean().withMessage("Category status must be true or false."),
];

export const categoryCreateValidator = [
  body("name").trim().notEmpty().withMessage("Category name is required.").isLength({ min: 2, max: 120 }).withMessage("Category name must be between 2 and 120 characters."),
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  ...categoryFields,
];

export const categoryUpdateValidator = [
  body("name").trim().notEmpty().withMessage("Category name is required.").isLength({ min: 2, max: 120 }).withMessage("Category name must be between 2 and 120 characters."),
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  ...categoryFields,
];

export const categoryValidator = categoryCreateValidator;
