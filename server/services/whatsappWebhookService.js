import crypto from "node:crypto";
import { env } from "../config/env.js";

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWebhookChallenge(mode, token) {
  return Boolean(env.whatsapp.webhookVerifyToken)
    && mode === "subscribe"
    && secureEqual(token, env.whatsapp.webhookVerifyToken);
}

export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!env.whatsapp.appSecret || !Buffer.isBuffer(rawBody) || !/^sha256=[a-f\d]{64}$/i.test(String(signatureHeader || ""))) return false;
  const expected = `sha256=${crypto.createHmac("sha256", env.whatsapp.appSecret).update(rawBody).digest("hex")}`;
  return secureEqual(signatureHeader, expected);
}

export function parseWhatsAppWebhook(rawBody) {
  const event = JSON.parse(rawBody.toString("utf8"));
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new SyntaxError("Invalid WhatsApp webhook event.");
  return event;
}
