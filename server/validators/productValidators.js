// Validation chains for product routes.
import { body, param, query } from "express-validator";
import { sizeInLitres } from "../utils/shippingDefaults.js";

export const productIdValidator = [param("id").isMongoId().withMessage("Valid product id is required.")];
export const productSlugValidator = [param("slug").trim().notEmpty().withMessage("Product slug is required.")];

export const productQueryValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be positive."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100."),
  query("all").optional().isBoolean().withMessage("All products flag must be boolean."),
  query("minPrice").optional().isFloat({ min: 0 }).withMessage("Minimum price must be positive."),
  query("maxPrice").optional().isFloat({ min: 0 }).withMessage("Maximum price must be positive."),
  query("category").optional().isMongoId().withMessage("Category filter must be a valid category id."),
];

const productFields = [
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  body("discountPrice").optional().isFloat({ gt: 0 }).withMessage("Discount price must be greater than zero."),
  body("stock").optional().isInt({ min: 0 }).withMessage("Stock cannot be negative."),
  body("images").optional().isArray({ min: 1 }).withMessage("At least one product image is required."),
  body("images.*.url").optional().isURL().withMessage("Product image URL must be valid."),
  body("discountPrice").optional().custom((value, { req }) => req.body.price === undefined || Number(value) < Number(req.body.price)).withMessage("Discount price must be lower than the regular price."),
  body("tags").optional().isArray().withMessage("Tags must be an array."),
  body("tags.*").optional().trim().notEmpty().withMessage("Tags cannot be empty."),
  body("featured").optional().isBoolean().withMessage("Featured must be boolean."),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("variants").optional().isArray({ min: 1 }).withMessage("Variants must be a non-empty array."),
  body("variants.*.size").optional({ checkFalsy: false }).trim().notEmpty().withMessage("Variant size is required.").bail().custom((value) => { sizeInLitres(value); return true; }),
  body("variants.*.price").optional({ checkFalsy: false }).isFloat({ gt: 0 }).withMessage("Variant price must be greater than zero."),
  body("variants.*.mrp").optional({ checkFalsy: false }).isFloat({ gt: 0 }).withMessage("Variant MRP must be greater than zero.").bail().custom((value, { req, pathValues }) => Number(value) >= Number(req.body.variants?.[pathValues[0]]?.price)).withMessage("Variant MRP cannot be lower than its price."),
  body("variants.*.stock").optional({ checkFalsy: false }).isFloat({ min: 0 }).withMessage("Variant stock in litres cannot be negative."),
  body("variants.*.images").optional().isArray().withMessage("Variant images must be an array."),
  body("variants.*.images.*.url").optional().isURL().withMessage("Variant image URL must be valid."),
];

export const productValidator = [
  body("title").trim().notEmpty().withMessage("Product title is required."),
  body("description").trim().notEmpty().withMessage("Description is required."),
  body("price").isFloat({ gt: 0 }).withMessage("Price must be greater than zero."),
  body("category").isMongoId().withMessage("Valid category is required."),
  body("size").trim().notEmpty().withMessage("Product size is required.").bail().custom((value) => { sizeInLitres(value); return true; }),
  ...productFields,
];

export const productUpdateValidator = [
  body("title").optional().trim().notEmpty().withMessage("Product title cannot be empty."),
  body("description").optional().trim().notEmpty().withMessage("Description cannot be empty."),
  body("price").optional().isFloat({ gt: 0 }).withMessage("Price must be greater than zero."),
  body("category").optional().isMongoId().withMessage("Valid category is required."),
  body("size").optional().trim().notEmpty().withMessage("Product size cannot be empty.").bail().custom((value) => { sizeInLitres(value); return true; }),
  ...productFields,
];
