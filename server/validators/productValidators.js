// Validation chains for product routes.
import { body, param, query } from "express-validator";

export const productIdValidator = [param("id").isMongoId().withMessage("Valid product id is required.")];
export const productSlugValidator = [param("slug").trim().notEmpty().withMessage("Product slug is required.")];

export const productQueryValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be positive."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100."),
  query("all").optional().isBoolean().withMessage("All products flag must be boolean."),
  query("minPrice").optional().isFloat({ min: 0 }).withMessage("Minimum price must be positive."),
  query("maxPrice").optional().isFloat({ min: 0 }).withMessage("Maximum price must be positive."),
];

const productFields = [
  body("slug").optional().trim().isSlug().withMessage("Slug must be URL friendly."),
  body("discountPrice").optional().isFloat({ gt: 0 }).withMessage("Discount price must be greater than zero."),
  body("stock").optional().isInt({ min: 0 }).withMessage("Stock cannot be negative."),
  body("images").optional().isArray({ min: 1 }).withMessage("At least one product image is required."),
  body("discountPrice").optional().custom((value, { req }) => req.body.price === undefined || Number(value) < Number(req.body.price)).withMessage("Discount price must be lower than the regular price."),
  body("tags").optional().isArray().withMessage("Tags must be an array."),
  body("tags.*").optional().trim().notEmpty().withMessage("Tags cannot be empty."),
  body("featured").optional().isBoolean().withMessage("Featured must be boolean."),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("variants").isArray({ min: 1 }).withMessage("At least one variant is required."),
  body("variants.*._id").optional().isMongoId().withMessage("Invalid variant id."),
  body("variants.*.name").trim().notEmpty().withMessage("Variant name is required."),
  body("variants.*.sku").trim().notEmpty().withMessage("Variant SKU is required."),
  body("variants.*.price").isFloat({ gt: 0 }).withMessage("Variant price must be greater than zero."),
  body("variants.*.mrp").isFloat({ gt: 0 }).custom((value, { req, path }) => { const index = Number(path.match(/variants\[(\d+)\]/)?.[1]); return Number(value) >= Number(req.body.variants?.[index]?.price); }).withMessage("Variant MRP must be at least its price."),
  body("variants.*.stock").isInt({ min: 0 }).withMessage("Variant stock cannot be negative."),
  body("variants.*.weight").isFloat({ min: 0 }).withMessage("Variant weight cannot be negative."),
  body("variants.*.dimensions.length").isFloat({ min: 0 }).withMessage("Variant package length cannot be negative."),
  body("variants.*.dimensions.width").isFloat({ min: 0 }).withMessage("Variant package width cannot be negative."),
  body("variants.*.dimensions.height").isFloat({ min: 0 }).withMessage("Variant package height cannot be negative."),
  body("variants.*.images").isArray({ min: 1 }).withMessage("Each variant needs at least one image."),
  body("variants.*.isActive").optional().isBoolean().withMessage("Variant active status must be boolean."),
  body("variants").custom((variants) => variants.some((variant) => variant.isActive !== false && !variant.isArchived)).withMessage("At least one active variant is required."),
  body("variants").custom((variants) => new Set(variants.filter((variant) => !variant.isArchived).map((variant) => String(variant.name).trim().toLowerCase())).size === variants.filter((variant) => !variant.isArchived).length).withMessage("Variant sizes must be unique within a product."),
  body("variants").custom((variants) => new Set(variants.filter((variant) => !variant.isArchived).map((variant) => String(variant.sku).trim().toUpperCase())).size === variants.filter((variant) => !variant.isArchived).length).withMessage("Variant SKUs must be unique."),
];

export const productValidator = [
  body("title").trim().notEmpty().withMessage("Product title is required."),
  body("description").trim().notEmpty().withMessage("Description is required."),
  ...productFields,
];

export const productUpdateValidator = [
  body("title").optional().trim().notEmpty().withMessage("Product title cannot be empty."),
  body("description").optional().trim().notEmpty().withMessage("Description cannot be empty."),
  ...productFields,
];
