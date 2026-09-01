// Double-submit CSRF protection for authenticated browser mutations.
import { ApiError } from "../utils/ApiError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = new Set(["/api/auth/otp/request", "/api/auth/otp/verify", "/api/auth/google", "/api/auth/refresh", "/api/payments/webhook", "/api/shiprocket/webhook"]);

export function csrfGuard(req, _res, next) {
  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();
  const cookieToken = req.cookies?.csrfToken;
  if (!cookieToken) return next();
  const headerToken = req.get("X-CSRF-Token");
  if (!headerToken || headerToken !== cookieToken) return next(new ApiError("Invalid CSRF token.", 403));
  return next();
}
