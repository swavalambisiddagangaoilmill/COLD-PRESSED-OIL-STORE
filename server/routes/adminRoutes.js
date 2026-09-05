// Admin route registration.
import { Router } from "express";
import { body, param } from "express-validator";
import { getStats, getUsers, removeUser, updateRole } from "../controllers/adminController.js";
import { getAllOrdersHandler, readyToShipHandler, updateOrderStatusHandler } from "../controllers/orderController.js";
import { createCategoryHandler, deleteCategoryHandler, updateCategoryHandler } from "../controllers/categoryController.js";
import { createProductHandler, deleteProductHandler, updateProductHandler } from "../controllers/productController.js";
import { adminOnly } from "../middleware/admin.js";
import { protect } from "../middleware/auth.js";
import { logAdminMutation } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { userIdValidator, roleValidator } from "../validators/adminValidators.js";
import { orderIdValidator, updateOrderStatusValidator } from "../validators/orderValidators.js";
import { categoryCreateValidator, categoryIdValidator, categoryUpdateValidator } from "../validators/categoryValidators.js";
import { productIdValidator, productUpdateValidator, productValidator } from "../validators/productValidators.js";
import * as adminPanelController from "../admin/controllers/adminController.js";
import { requireOwner } from "../admin/middleware/adminAuth.js";
import { adminMutationLimiter, adminReadLimiter } from "../middleware/rateLimits.js";

const router = Router();
router.use(protect, adminOnly);
router.use(adminReadLimiter, adminMutationLimiter);
router.use(logAdminMutation);

router.get("/gallery", adminPanelController.galleryImages);
router.post("/gallery", [body("image").custom((value) => Boolean(value?.url || typeof value === "string")).withMessage("Gallery image is required.")], validate, adminPanelController.saveGalleryImage);
router.put("/gallery/reorder", [body("ids").isArray().withMessage("Gallery order is required.")], validate, adminPanelController.reorderGalleryImages);
router.put("/gallery/:id", [param("id").isMongoId().withMessage("Valid gallery image id is required.")], validate, adminPanelController.saveGalleryImage);
router.delete("/gallery/:id", [param("id").isMongoId().withMessage("Valid gallery image id is required.")], validate, adminPanelController.deleteGalleryImage);
router.get("/stats", getStats);
router.get("/users", getUsers);
router.put("/users/:id/role", userIdValidator, roleValidator, validate, updateRole);
router.delete("/users/:id", userIdValidator, validate, removeUser);
router.get("/orders", getAllOrdersHandler);
router.put("/orders/:id/status", orderIdValidator, updateOrderStatusValidator, validate, updateOrderStatusHandler);
router.post("/orders/:id/ready-to-ship", orderIdValidator, validate, readyToShipHandler);
router.post("/products", productValidator, validate, createProductHandler);
router.put("/products/:id", productIdValidator, productUpdateValidator, validate, updateProductHandler);
router.delete("/products/:id", productIdValidator, validate, deleteProductHandler);
router.post("/categories", categoryCreateValidator, validate, createCategoryHandler);
router.put("/categories/:id", categoryIdValidator, categoryUpdateValidator, validate, updateCategoryHandler);
router.delete("/categories/:id", requireOwner, categoryIdValidator, validate, deleteCategoryHandler);

export default router;



