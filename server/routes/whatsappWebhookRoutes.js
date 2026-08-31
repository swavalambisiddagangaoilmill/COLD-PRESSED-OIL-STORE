import { Router, raw } from "express";
import { receiveWhatsAppWebhook, verifyWhatsAppWebhook } from "../controllers/whatsappWebhookController.js";

const router = Router();

router.get("/", verifyWhatsAppWebhook);
router.post("/", raw({ type: "application/json", limit: "256kb" }), receiveWhatsAppWebhook);

export default router;
