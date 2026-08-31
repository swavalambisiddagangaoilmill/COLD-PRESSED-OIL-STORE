import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-webhook-verify-token";
process.env.WHATSAPP_APP_SECRET = "test-meta-app-secret";

const { parseWhatsAppWebhook, verifyWebhookChallenge, verifyWebhookSignature } = await import("../services/whatsappWebhookService.js");

test("WhatsApp webhook verifies Meta's subscription challenge token", () => {
  assert.equal(verifyWebhookChallenge("subscribe", "test-webhook-verify-token"), true);
  assert.equal(verifyWebhookChallenge("subscribe", "wrong-token"), false);
  assert.equal(verifyWebhookChallenge("unexpected", "test-webhook-verify-token"), false);
});

test("WhatsApp webhook accepts only a valid Meta SHA-256 signature", () => {
  const rawBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));
  const signature = `sha256=${crypto.createHmac("sha256", "test-meta-app-secret").update(rawBody).digest("hex")}`;
  assert.equal(verifyWebhookSignature(rawBody, signature), true);
  assert.equal(verifyWebhookSignature(rawBody, `sha256=${"0".repeat(64)}`), false);
  assert.equal(verifyWebhookSignature(rawBody, "malformed"), false);
});

test("WhatsApp webhook safely parses valid and malformed event bodies", () => {
  assert.deepEqual(parseWhatsAppWebhook(Buffer.from('{"object":"whatsapp_business_account","entry":[]}')), { object: "whatsapp_business_account", entry: [] });
  assert.throws(() => parseWhatsAppWebhook(Buffer.from("not-json")), SyntaxError);
  assert.throws(() => parseWhatsAppWebhook(Buffer.from("[]")), SyntaxError);
});
