// Loads and normalizes environment configuration.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || "0.0.0.0",
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL || "",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ss_oil_mill_ecommerce",
  jwtSecret: process.env.JWT_SECRET || "development_only_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  clientUrls: (process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:5173").split(",").map((url) => url.trim()).filter(Boolean),
  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  },
  turnstile: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || "",
  },
  otp: {
    provider: process.env.OTP_PROVIDER || "msg91",
    msg91AuthKey: process.env.MSG91_AUTH_KEY || "",
    msg91TemplateId: process.env.MSG91_TEMPLATE_ID || "",
    msg91SenderId: process.env.MSG91_SENDER_ID || "",
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
    mock: !isProduction && process.env.SHIPROCKET_MOCK === "true",
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

if (isProduction && (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID)) {
  throw new Error("MSG91 OTP configuration is required in production.");
}

if (isProduction && process.env.SHIPROCKET_MOCK === "true") {
  throw new Error("SHIPROCKET_MOCK cannot be enabled in production.");
}



if (isProduction) {
  const required = [
    ["MONGO_URI", env.mongoUri],
    ["CLIENT_URL", env.clientUrl],
  ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
}

