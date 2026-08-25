// Product route registration.
import { Router } from "express";
import {
  createProductHandler,
  deleteProductHandler,
  getFeatured,
  getProduct,
  getProducts,
  getRelated,
  updateProductHandler,
} from "../controllers/productController.js";
import { adminOnly } from "../middleware/admin.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { productIdValidator, productQueryValidator, productSlugValidator, productUpdateValidator, productValidator } from "../validators/productValidators.js";

const router = Router();
router.get("/", productQueryValidator, validate, getProducts);
router.get("/featured", getFeatured);
router.get("/:id/related", productIdValidator, validate, getRelated);
router.get("/:slug", productSlugValidator, validate, getProduct);
router.post("/", protect, adminOnly, productValidator, validate, createProductHandler);
router.put("/:id", protect, adminOnly, productIdValidator, productUpdateValidator, validate, updateProductHandler);
router.delete("/:id", protect, adminOnly, productIdValidator, validate, deleteProductHandler);

export default router;
