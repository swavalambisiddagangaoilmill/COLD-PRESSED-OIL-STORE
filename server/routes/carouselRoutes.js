import { Router } from "express";
import { getActiveCarousel } from "../controllers/carouselController.js";

const router = Router();
router.get("/", getActiveCarousel);
export default router;
