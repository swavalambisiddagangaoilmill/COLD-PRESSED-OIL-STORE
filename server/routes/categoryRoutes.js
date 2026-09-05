// Category route registration.
import { Router } from "express";
import { createCategoryHandler, deleteCategoryHandler, getCategories, getCategoryByIdOrSlug, updateCategoryHandler } from "../controllers/categoryController.js";
import { adminOnly } from "../middleware/admin.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { categoryIdValidator, categoryValidator } from "../validators/categoryValidators.js";
import { requireOwner } from "../admin/middleware/adminAuth.js";

const router = Router();

router.get("/", getCategories);
router.get("/:idOrSlug", getCategoryByIdOrSlug);
router.post("/", protect, adminOnly, categoryValidator, validate, createCategoryHandler);
router.put("/:id", protect, adminOnly, categoryIdValidator, categoryValidator, validate, updateCategoryHandler);
router.delete("/:id", protect, adminOnly, requireOwner, categoryIdValidator, validate, deleteCategoryHandler);

export default router;
