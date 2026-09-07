import crypto from "node:crypto";
import AuthRateLimit from "../models/AuthRateLimit.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logSecurityEvent } from "./securityEventService.js";

const GENERIC_MESSAGE = "Too many authentication attempts. Please try again later.";

function hashIdentifier(scope, identifier) {
  return crypto.createHmac("sha256", env.jwtSecret).update(`${scope}:${String(identifier || "unknown").trim().toLowerCase()}`).digest("hex");
}

export async function consumeSlidingWindow({ scope, identifier, limit, windowMs, now = new Date() }) {
  const cutoff = new Date(now.getTime() - windowMs);
  const key = hashIdentifier(scope, identifier);
  const update = [{ $set: {
      scope,
      hits: { $slice: [{ $concatArrays: [{ $filter: { input: { $ifNull: ["$hits", []] }, as: "hit", cond: { $gt: ["$$hit", cutoff] } } }, [now]] }, limit + 1] },
      expiresAt: new Date(now.getTime() + windowMs),
  } }];
  let record;
  try {
    record = await AuthRateLimit.findOneAndUpdate({ key }, update, { upsert: true, new: true });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    record = await AuthRateLimit.findOneAndUpdate({ key }, update, { new: true });
  }
  return { allowed: record.hits.length <= limit, retryAfterSeconds: Math.max(1, Math.ceil((record.hits[0].getTime() + windowMs - now.getTime()) / 1000)) };
}

export function slidingAuthLimiter({ scope, identifier, limit, windowMs, eventType = "auth_rate_limited" }) {
  return async (req, res, next) => {
    try {
      const result = await consumeSlidingWindow({ scope, identifier: identifier(req), limit, windowMs });
      if (result.allowed) return next();
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      await logSecurityEvent(req, eventType, { scope }, "high");
      return next(new ApiError(GENERIC_MESSAGE, 429));
    } catch (error) {
      return next(error);
    }
  };
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
export const adminLoginIpLimiter = slidingAuthLimiter({ scope: "admin_login_ip", identifier: (req) => req.ip, limit: 12, windowMs: FIFTEEN_MINUTES, eventType: "admin_login_ip_rate_limited" });
export const adminLoginAccountLimiter = slidingAuthLimiter({ scope: "admin_login_account", identifier: (req) => req.body?.email, limit: 10, windowMs: FIFTEEN_MINUTES, eventType: "admin_login_account_rate_limited" });
export const adminContinueIpLimiter = slidingAuthLimiter({ scope: "admin_continue_ip", identifier: (req) => req.ip, limit: 8, windowMs: FIFTEEN_MINUTES, eventType: "admin_continue_rate_limited" });
