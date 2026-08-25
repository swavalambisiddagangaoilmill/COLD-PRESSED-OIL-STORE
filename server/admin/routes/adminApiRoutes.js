// Admin API routes with permission enforcement.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { body, param } from "express-validator";
import * as controller from "../controllers/adminController.js";
import { requireAdmin, requireAdminPermission } from "../middleware/adminAuth.js";
import { protect } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { productIdValidator, productUpdateValidator, productValidator } from "../../validators/productValidators.js";

const router = Router();
const restrictionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many restriction management requests.", errors: [] } });
const restrictionId = [param("id").isMongoId().withMessage("Valid restriction id is required.")];
const noteBody = [body("note").trim().isLength({ min: 2, max: 1000 }).withMessage("Internal note is required.")];
const reasonBody = [body("reason").trim().isLength({ min: 2, max: 1000 }).withMessage("Admin reason is required.")];
const extendBody = [...reasonBody, body("expiresAt").isISO8601().withMessage("Valid expiry time is required.")];
router.use(protect, requireAdmin);

router.get("/search", requireAdminPermission("dashboard.read"), controller.globalSearch);
router.get("/dashboard", requireAdminPermission("dashboard.read"), controller.dashboard);
router.get("/notifications", requireAdminPermission("notifications.read"), controller.notifications);
router.put("/notifications/:id/read", requireAdminPermission("notifications.read"), controller.markNotificationRead);
router.delete("/notifications/:id", requireAdminPermission("notifications.read"), controller.removeNotification);
router.post("/notifications/mark-all-read", requireAdminPermission("notifications.read"), controller.markNotificationsRead);
router.delete("/notifications/clear-read", requireAdminPermission("notifications.read"), controller.clearReadNotificationsHandler);
router.get("/notification-preferences", requireAdminPermission("settings.read"), controller.notificationPreferences);
router.put("/notification-preferences", requireAdminPermission("settings.manage"), controller.saveNotificationPreferencesHandler);
router.get("/sessions", requireAdminPermission("sessions.read"), controller.sessions);
router.post("/sessions/revoke", requireAdminPermission("sessions.manage"), body("sessionIds").isArray({ min: 1, max: 5 }).withMessage("Select one or more sessions to revoke."), body("sessionIds.*").isUUID().withMessage("Valid session id is required."), validate, controller.revokeSessions);
router.get("/orders", requireAdminPermission("orders.read"), controller.orders);
router.put("/orders/:id/status", requireAdminPermission("orders.update"), controller.orderStatus);
router.post("/orders/:id/ready-to-ship", requireAdminPermission("orders.ship"), controller.orderReadyToShip);
router.post("/orders/:id/handover", requireAdminPermission("shipping.manage"), controller.orderHandover);
router.post("/orders/:id/mock-shipment/next", requireAdminPermission("shipping.manage"), controller.mockShippingNext);
router.get("/products", requireAdminPermission("products.read"), controller.products);
router.post("/products", requireAdminPermission("products.create"), productValidator, validate, controller.saveProduct);
router.put("/products/:id", requireAdminPermission("products.update"), productIdValidator, productUpdateValidator, validate, controller.saveProduct);
router.delete("/products/:id", requireAdminPermission("products.archive"), productIdValidator, validate, controller.archiveProduct);
router.post("/products/bulk-price/preview", requireAdminPermission("products.update"), controller.bulkPricePreview);
router.post("/products/bulk-price/apply", requireAdminPermission("products.update"), controller.bulkPriceApply);
router.put("/inventory/:id", requireAdminPermission("inventory.update"), productIdValidator, [body("variantId").optional().isMongoId().withMessage("Valid variant id is required."), body("mode").isIn(["add", "reduce", "set"]).withMessage("Valid stock update mode is required."), body("quantity").isInt({ min: 0 }).withMessage("Quantity must be a whole number of zero or more."), body().custom((value) => value.mode === "set" || Number(value.quantity) > 0).withMessage("Add or reduce quantity must be greater than zero.")], validate, controller.inventoryUpdate);
router.get("/categories", requireAdminPermission("categories.read"), controller.categories);
router.post("/categories", requireAdminPermission("categories.manage"), controller.saveCategory);
router.put("/categories/:id", requireAdminPermission("categories.manage"), controller.saveCategory);
router.get("/gallery", requireAdminPermission("gallery.read"), controller.galleryImages);
router.post("/gallery", requireAdminPermission("gallery.manage"), [body("image").custom((value) => Boolean(value?.url || typeof value === "string")).withMessage("Gallery image is required.")], validate, controller.saveGalleryImage);
router.put("/gallery/reorder", requireAdminPermission("gallery.manage"), [body("ids").isArray().withMessage("Gallery order is required.")], validate, controller.reorderGalleryImages);
router.put("/gallery/:id", requireAdminPermission("gallery.manage"), [param("id").isMongoId().withMessage("Valid gallery image id is required.")], validate, controller.saveGalleryImage);
router.delete("/gallery/:id", requireAdminPermission("gallery.manage"), [param("id").isMongoId().withMessage("Valid gallery image id is required.")], validate, controller.deleteGalleryImage);
router.get("/offers", requireAdminPermission("offers.read"), controller.offers);
router.post("/offers", requireAdminPermission("offers.manage"), controller.createOffer);
router.put("/offers/:id", requireAdminPermission("offers.manage"), controller.updateOffer);
router.delete("/offers/:id", requireAdminPermission("offers.manage"), controller.deleteOffer);
router.get("/coupons", requireAdminPermission("coupons.read"), controller.coupons);
router.post("/coupons", requireAdminPermission("coupons.manage"), controller.createCoupon);
router.put("/coupons/:id", requireAdminPermission("coupons.manage"), controller.updateCoupon);
router.delete("/coupons/:id", requireAdminPermission("coupons.manage"), controller.deleteCoupon);
router.get("/shipping", requireAdminPermission("shipping.read"), controller.shipping);
router.get("/customers", requireAdminPermission("customers.read"), controller.customers);
router.get("/payments", requireAdminPermission("payments.read"), controller.payments);
router.get("/messages", requireAdminPermission("messages.read"), controller.messages);
router.put("/messages/:id/status", requireAdminPermission("messages.manage"), controller.messageStatus);
router.get("/reports", requireAdminPermission("reports.read"), controller.reports);
router.get("/users", requireAdminPermission("admins.read"), controller.adminUsers);
router.put("/users/:id", requireAdminPermission("admins.manage"), controller.updateAdmin);
router.get("/audit-logs", requireAdminPermission("audit.read"), controller.auditLogs);
router.get("/restrictions", restrictionLimiter, requireAdminPermission("restrictions.read"), controller.restrictions);
router.get("/restrictions/:id", restrictionLimiter, requireAdminPermission("restrictions.read"), restrictionId, validate, controller.restrictionDetails);
router.post("/restrictions/:id/remove", restrictionLimiter, requireAdminPermission("restrictions.manage"), restrictionId, reasonBody, validate, controller.removeRestrictionHandler);
router.post("/restrictions/:id/extend", restrictionLimiter, requireAdminPermission("restrictions.manage"), restrictionId, extendBody, validate, controller.extendRestrictionHandler);
router.post("/restrictions/:id/notes", restrictionLimiter, requireAdminPermission("restrictions.manage"), restrictionId, noteBody, validate, controller.addRestrictionNoteHandler);
router.get("/settings", requireAdminPermission("settings.read"), controller.settings);
router.put("/settings", requireAdminPermission("settings.manage"), controller.saveSettings);

export default router;








