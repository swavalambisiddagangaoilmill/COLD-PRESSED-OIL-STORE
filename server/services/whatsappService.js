import { env } from "../config/env.js";

function requireLiveConfig() {
  const missing = [
    ["WHATSAPP_ACCESS_TOKEN", env.whatsapp.accessToken],
    ["WHATSAPP_PHONE_NUMBER_ID", env.whatsapp.phoneNumberId],
    ["WHATSAPP_OTP_TEMPLATE_NAME", env.whatsapp.otpTemplateName],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing WhatsApp configuration: ${missing.join(", ")}`);
}

async function sendTemplate(phoneNumber, templateName, components) {
  requireLiveConfig();
  const response = await fetch(`https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phoneNumber.replace(/^\+/, ""), type: "template", template: { name: templateName, language: { code: env.whatsapp.languageCode }, components } }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "WhatsApp API request failed.");
  return data;
}

export async function sendOTP(phoneNumber, otp) {
  if (env.whatsapp.mode === "mock") {
    if (env.isProduction) throw new Error("WHATSAPP_MODE=mock is not allowed in production.");
    console.info(`[WhatsApp mock] OTP for ${phoneNumber}: ${otp}`);
    return { mock: true };
  }
  return sendTemplate(phoneNumber, env.whatsapp.otpTemplateName, [
    { type: "body", parameters: [{ type: "text", text: otp }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] },
  ]);
}

export function sendOrderTrackingMessage(phoneNumber, orderNumber, trackingUrl, itemSummary = "") {
  if (env.whatsapp.mode === "mock") return Promise.resolve({ mock: true });
  return sendTemplate(phoneNumber, env.whatsapp.trackingTemplateName, [{ type: "body", parameters: [{ type: "text", text: orderNumber }, { type: "text", text: itemSummary || "Order items" }, { type: "text", text: trackingUrl }] }]);
}

export function sendMarketingMessage(user, templateName, parameters = []) {
  if (!user?.whatsappOptIn) throw new Error("Marketing WhatsApp consent is required.");
  if (env.whatsapp.mode === "mock") return Promise.resolve({ mock: true });
  return sendTemplate(user.phoneNumber, templateName, [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text: String(text) })) }]);
}

// Called only after the marketing service has validated its server-owned destination and template.
export function sendApprovedMarketingTemplate(phoneNumber, templateName, parameters = []) {
  if (env.whatsapp.mode === "mock") return Promise.resolve({ mock: true, messages: [{ id: `mock-${Date.now()}` }] });
  return sendTemplate(phoneNumber, templateName, [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text: String(text) })) }]);
}
