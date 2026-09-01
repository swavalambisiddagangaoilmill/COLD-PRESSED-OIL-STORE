// Express application composition and route mounting.
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { cspConnectSources, corsOrigin } from "./config/cors.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { csrfGuard } from "./middleware/csrf.js";
import { notFound } from "./middleware/notFound.js";
import { assignRequestId, preventParameterPollution, sanitizeRequest } from "./middleware/security.js";
import { restrictionGuard } from "./middleware/restrictionGuard.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminCarouselRoutes from "./routes/adminCarouselRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminApiRoutes from "./admin/routes/adminApiRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import shiprocketRoutes from "./routes/shiprocketRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import whatsappWebhookRoutes from "./routes/whatsappWebhookRoutes.js";
import { cashfreeWebhook } from "./controllers/paymentController.js";
import { getActiveCarousel } from "./controllers/carouselController.js";
import { getServiceStatus } from "./services/serviceStatusService.js";

const app = express();
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

app.set("trust proxy", 1);
app.use(assignRequestId);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", ...cspConnectSources()],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
});
app.use(compression());
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
}));
app.use(cookieParser());
app.post("/api/payments/webhook", webhookLimiter, express.raw({ type: "application/json", limit: "256kb" }), cashfreeWebhook);
app.use("/api/whatsapp/webhook", webhookLimiter, whatsappWebhookRoutes);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb", parameterLimit: 50 }));
app.use(sanitizeRequest);
app.use(preventParameterPollution);
app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ success: true, message: "API is healthy" });
});
app.get("/api/service-status", async (_req, res, next) => {
  try {
    const data = await getServiceStatus();
    res.setHeader("Cache-Control", "private, max-age=30");
    res.status(200).json({ success: true, message: "Service status fetched", data });
  } catch (error) {
    next(error);
  }
});
app.use(restrictionGuard);
app.use(morgan(env.isProduction ? "combined" : "dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 150, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests.", errors: [] } }));

app.get("/api/carousel", getActiveCarousel);
app.use("/api/auth", authRoutes);
app.use("/api/admin-auth", adminAuthRoutes);
app.use("/api/admin/carousel", adminCarouselRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin-panel", adminApiRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/shiprocket", shiprocketRoutes);
app.use("/api", contactRoutes);
app.use("/api/content", contentRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;








