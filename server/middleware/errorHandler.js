// Centralized error response middleware.
import { sendError } from "../utils/apiResponse.js";
import { getAdminErrorContext, isAdminApiRequest, isDatabaseError, sanitizeAdminLogMessage } from "../utils/adminErrorContext.js";

export function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || "Server error";
  let errors = error.errors || [];
  const adminRequest = isAdminApiRequest(req);
  let adminContext = adminRequest ? getAdminErrorContext(req) : null;

  if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource identifier.";
  }

  if (error.code === 11000) {
    statusCode = 409;
    message = "Duplicate resource value.";
    errors = Object.keys(error.keyValue || {}).map((field) => ({ field, message: `${field} already exists.` }));
  }

  if (adminRequest && isDatabaseError(error) && error.code !== 11000) {
    adminContext = { ...adminContext, service: "Database", code: "DATABASE_OPERATION_FAILED" };
  }
  if (adminRequest && error.adminService) {
    adminContext = { service: error.adminService, action: error.adminAction || adminContext.action, code: error.serviceCode || adminContext.code };
  }

  if (error.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token.";
  }

  if (error.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authentication token expired.";
  }

  if (error.name === "MulterError") {
    statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = error.code === "LIMIT_FILE_SIZE" ? "Image must be 3 MB or smaller." : "The image upload is invalid.";
  }

  if (statusCode >= 500 && !error.isOperational) {
    message = "Service is temporarily unavailable. Please try again shortly.";
    errors = [];
  }

  if (adminRequest) {
    if (statusCode === 401) adminContext = { service: "Authentication Service", action: "validate the admin session", code: "ADMIN_AUTHENTICATION_FAILED" };
    else if (statusCode === 403) adminContext = { service: "Authorization Service", action: "authorize the admin action", code: "ADMIN_AUTHORIZATION_FAILED" };
    else if (statusCode === 429) adminContext = { service: "Rate Limit Service", action: adminContext.action, code: "ADMIN_RATE_LIMITED" };
    const safeDetail = error.isOperational || statusCode < 500 ? message : `Unable to ${adminContext.action}.`;
    message = safeDetail;
    const requestId = req.id;
    const logData = { requestId, service: adminContext.service, action: adminContext.action, method: req.method, path: String(req.originalUrl || "").split("?")[0], statusCode, errorName: error.name, errorMessage: sanitizeAdminLogMessage(error.message) };
    if (statusCode >= 500) console.error("[Admin API Error]", logData);
    const structured = { service: adminContext.service, code: error.serviceCode || adminContext.code, action: adminContext.action, message: safeDetail, requestId };
    const reason = statusCode < 500 ? error.reason : undefined;
    return sendError(res, statusCode, message, errors, reason, structured);
  }

  if (process.env.NODE_ENV !== "production" && statusCode >= 500) {
    console.error(error);
  }

  const reason = statusCode < 500 ? error.reason : undefined;
  return sendError(res, statusCode, message, errors, reason);
}
