import { Router } from "express";
import { body, param } from "express-validator";
import { createCarousel, deleteCarousel, listCarousel, reorderCarousel, replaceCarousel, updateCarouselStatus } from "../controllers/carouselAdminController.js";
import { adminOnly } from "../middleware/admin.js";
import { protect } from "../middleware/auth.js";
import { logAdminMutation } from "../middleware/security.js";
import { upload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(protect, adminOnly, logAdminMutation);
router.get("/", listCarousel);
router.post("/", upload.single("image"), [body("category").isIn(["desktop", "mobile"]).withMessage("Desktop or mobile carousel category is required.")], validate, createCarousel);
router.patch("/reorder", [body("category").isIn(["desktop", "mobile"]).withMessage("Desktop or mobile carousel category is required."), body("ids").isArray({ min: 1 }).withMessage("Carousel order is required."), body("ids.*").isMongoId().withMessage("Carousel order contains an invalid image id.")], validate, reorderCarousel);
router.patch("/:id/status", [param("id").isMongoId().withMessage("Valid carousel id is required."), body("isActive").isBoolean().withMessage("Carousel status is required.")], validate, updateCarouselStatus);
router.put("/:id/image", upload.single("image"), [param("id").isMongoId().withMessage("Valid carousel id is required.")], validate, replaceCarousel);
router.delete("/:id", [param("id").isMongoId().withMessage("Valid carousel id is required.")], validate, deleteCarousel);

export default router;
