import { Router } from "express";
import { body, param } from "express-validator";
import { createCarousel, deleteCarousel, listCarousel, reorderCarousel, updateCarousel, updateCarouselStatus } from "../controllers/carouselAdminController.js";
import { adminOnly } from "../middleware/admin.js";
import { protect } from "../middleware/auth.js";
import { logAdminMutation } from "../middleware/security.js";
import { carouselUpload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { adminMutationLimiter, adminReadLimiter } from "../middleware/rateLimits.js";

const router = Router();

router.use(protect, adminOnly, logAdminMutation);
router.use(adminReadLimiter, adminMutationLimiter);
router.get("/", listCarousel);
const slideFiles = carouselUpload.fields([{ name: "image", maxCount: 1 }, { name: "desktopImage", maxCount: 1 }]);
router.post("/", slideFiles, createCarousel);
router.patch("/reorder", [body("ids").isArray({ min: 1 }).withMessage("Carousel order is required."), body("ids.*").isMongoId().withMessage("Carousel order contains an invalid image id.")], validate, reorderCarousel);
router.put("/:id", [param("id").isMongoId().withMessage("Valid carousel id is required.")], validate, slideFiles, updateCarousel);
router.patch("/:id/status", [param("id").isMongoId().withMessage("Valid carousel id is required."), body("isActive").isBoolean().withMessage("Carousel status is required.")], validate, updateCarouselStatus);
router.delete("/:id", [param("id").isMongoId().withMessage("Valid carousel id is required.")], validate, deleteCarousel);

export default router;
