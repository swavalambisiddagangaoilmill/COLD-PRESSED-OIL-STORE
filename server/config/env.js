// Loads and normalizes environment configuration.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const isProduction = process.env.NODE_ENV === "production";
const shiprocketMock = String(process.env.SHIPROCKET_MOCK || "false").trim().toLowerCase() === "true";
const booleanValue = (value, fallback = false) => value == null ? fallback : String(value).trim().toLowerCase() === "true";
const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const keepAliveIntervalSeconds = Math.max(1, positiveNumber(process.env.KEEP_ALIVE_INTERVAL_SECONDS, 180));
const keepAliveJitterSeconds = Math.min(
  keepAliveIntervalSeconds - 1,
  positiveNumber(process.env.KEEP_ALIVE_JITTER_SECONDS, 30),
);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || "0.0.0.0",
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL || "",
  keepAlive: {
    enabled: isProduction && booleanValue(process.env.KEEP_ALIVE_ENABLED),
    baseUrl: process.env.KEEP_ALIVE_BASE_URL || process.env.BACKEND_PUBLIC_URL || "",
    intervalSeconds: keepAliveIntervalSeconds,
    jitterSeconds: Math.max(0, keepAliveJitterSeconds),
    path: process.env.KEEP_ALIVE_PATH || "/api/health",
    logging: booleanValue(process.env.KEEP_ALIVE_LOGGING),
    timeoutMs: 10_000,
  },
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ss_oil_mill_ecommerce",
  jwtSecret: process.env.JWT_SECRET || "development_only_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  clientUrls: (process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:5173").split(",").map((url) => url.trim()).filter(Boolean),
  whatsapp: {
    mode: process.env.WHATSAPP_MODE || (isProduction ? "live" : "mock"),
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v23.0",
    otpTemplateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME || "authentication",
    trackingTemplateName: process.env.WHATSAPP_TRACKING_TEMPLATE_NAME || "order_tracking",
    languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US",
  },
  turnstile: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || "",
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || "resend",
    from: process.env.EMAIL_FROM || "",
    replyTo: process.env.EMAIL_REPLY_TO || "",
    contactTo: process.env.CONTACT_TO_EMAIL || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET || "",
  },
  shiprocket: {
    mock: shiprocketMock,
    email: process.env.SHIPROCKET_EMAIL || "",
    password: process.env.SHIPROCKET_PASSWORD || "",
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || "",
    pickupPostcode: process.env.SHIPROCKET_PICKUP_POSTCODE || "",
    webhookSecret: process.env.SHIPROCKET_WEBHOOK_SECRET || "",
    defaultWeightKg: Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG) || 0,
    defaultLengthCm: Number(process.env.SHIPROCKET_DEFAULT_LENGTH_CM) || 0,
    defaultBreadthCm: Number(process.env.SHIPROCKET_DEFAULT_BREADTH_CM) || 0,
    defaultHeightCm: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM) || 0,
  },
};

if (isProduction && (env.jwtSecret === "development_only_change_me" || env.jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET must be a strong secret in production.");
}

if (isProduction) {
  const required = [
    ["MONGO_URI", process.env.MONGO_URI],
    ["CLIENT_URL", process.env.CLIENT_URL],
  ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  const productionOrigins = env.clientUrls.map((origin) => {
    try { return new URL(origin); } catch { throw new Error(`Invalid production client origin: ${origin}`); }
  });
  if (productionOrigins.some((url) => url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Production CLIENT_URL/CLIENT_URLS must contain only HTTPS public origins.");
  }
  if (env.whatsapp.mode === "mock") throw new Error("WHATSAPP_MODE=mock is not allowed in production.");
  if (env.shiprocket.mock) throw new Error("SHIPROCKET_MOCK=true is not allowed in production.");
}

