// Authenticates browser requests with the HttpOnly session cookie.
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyToken } from "../utils/jwt.js";
import { isAdminSessionActive, touchAdminSession } from "../services/adminSessionService.js";
import { enforceRestriction } from "../services/restrictionService.js";

export const protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) throw new ApiError("Authentication required.", 401);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const csrfHeader = req.get("x-csrf-token");
    if (!csrfHeader || csrfHeader !== req.cookies?.csrfToken) throw new ApiError("CSRF validation failed.", 403);
  }

  const decoded = verifyToken(token);
  const user = await User.findById(decoded.id);
  if (!user) throw new ApiError("User no longer exists.", 401);
  if (user.isDisabled) throw new ApiError("This account is disabled.", 403);
  req.authSessionId = decoded.sessionId;
  if (user.role === "admin") {
    if (!decoded.sessionId) throw new ApiError("Admin session is no longer valid.", 401);
    const active = await isAdminSessionActive(user._id, decoded.sessionId);
    if (!active) throw new ApiError("Admin session is no longer active.", 401);
    await touchAdminSession(decoded.sessionId);
  }

  req.user = user;
  await enforceRestriction(req);
  next();
});

export const optionalProtect = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.token;
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    req.user = await User.findById(decoded.id);
    req.authSessionId = decoded.sessionId;
  } catch {
    req.user = null;
  }
  next();
});
