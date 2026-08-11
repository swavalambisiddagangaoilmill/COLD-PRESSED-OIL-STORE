// Tracks external integration availability without blocking the API process.
import { env } from "../config/env.js";

const MESSAGE = {
  razorpay: "Online payments are temporarily unavailable.",
  resend: "Email notifications are temporarily unavailable.",
  googleOAuth: "Google sign-in is temporarily unavailable.",
  cloudinary: "Image uploads are temporarily unavailable.",
  shiprocket: "Shipping integration is temporarily unavailable.",
  ai: "AI assistant is temporarily unavailable.",
  turnstile: "Human verification is temporarily unavailable.",
  msg91: "OTP service is temporarily unavailable.",
};

let services = {};
let lastCheckedAt = null;

function status(name, state, message = "") {
  return { name, status: state, available: state !== "offline", message: message || MESSAGE[name] || "Service is temporarily unavailable." };
}

function configured(values) {
  return values.every(Boolean);
}

export function computeServiceStatus() {
  services = {
    razorpay: configured([env.razorpay.keyId, env.razorpay.keySecret]) ? status("razorpay", "online") : status("razorpay", "offline"),
    resend: configured([env.email.from, env.email.resendApiKey]) ? status("resend", "online") : status("resend", "offline"),
    googleOAuth: env.oauth.googleClientId ? status("googleOAuth", "online") : status("googleOAuth", "offline"),
    cloudinary: configured([env.cloudinary.cloudName, env.cloudinary.apiKey, env.cloudinary.apiSecret]) ? status("cloudinary", "online") : status("cloudinary", "offline"),
    shiprocket: env.shiprocket.mock
      ? status("shiprocket", "limited", "Shiprocket is running in development mock mode.")
      : configured([env.shiprocket.email, env.shiprocket.password, env.shiprocket.pickupLocation, env.shiprocket.pickupPostcode])
        ? status("shiprocket", "online")
        : status("shiprocket", "offline"),
    ai: status("ai", "online"),
    turnstile: env.turnstile.secretKey ? status("turnstile", "online") : status("turnstile", "limited", "Human verification is not configured."),
    msg91: env.otp.msg91AuthKey && env.otp.msg91TemplateId ? status("msg91", "online") : status("msg91", env.isProduction ? "offline" : "limited", "OTP service is using development fallback."),
  };
  lastCheckedAt = new Date().toISOString();
  return services;
}

export function getServiceStatus() {
  if (!lastCheckedAt) computeServiceStatus();
  return { checkedAt: lastCheckedAt, services };
}

export function isServiceAvailable(name) {
  return getServiceStatus().services[name]?.available !== false;
}

export function startServiceStatusMonitor() {
  computeServiceStatus();
  return setInterval(computeServiceStatus, 5 * 60 * 1000);
}

export function logExternalFailure(service, error, context = {}) {
  if (services[service]) {
    services[service] = status(service, "offline");
    lastCheckedAt = new Date().toISOString();
  }
  console.error(`[External Service Failure] ${service}`, {
    message: error?.message || String(error),
    name: error?.name,
    statusCode: error?.statusCode,
    context,
  });
}



