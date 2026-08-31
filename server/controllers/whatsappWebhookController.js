import { env } from "../config/env.js";
import { parseWhatsAppWebhook, verifyWebhookChallenge, verifyWebhookSignature } from "../services/whatsappWebhookService.js";

export function verifyWhatsAppWebhook(req, res) {
  if (!env.whatsapp.webhookVerifyToken) return res.status(503).send("Webhook verification is not configured.");
  if (!verifyWebhookChallenge(req.query["hub.mode"], req.query["hub.verify_token"])) return res.sendStatus(403);
  const challenge = req.query["hub.challenge"];
  if (typeof challenge !== "string" || !challenge) return res.sendStatus(400);
  return res.status(200).send(challenge);
}

export function receiveWhatsAppWebhook(req, res) {
  if (!env.whatsapp.appSecret) return res.status(503).json({ success: false, message: "Webhook signature verification is not configured." });
  if (!verifyWebhookSignature(req.body, req.get("X-Hub-Signature-256"))) return res.sendStatus(401);
  try {
    parseWhatsAppWebhook(req.body);
  } catch {
    return res.sendStatus(400);
  }
  return res.sendStatus(200);
}
