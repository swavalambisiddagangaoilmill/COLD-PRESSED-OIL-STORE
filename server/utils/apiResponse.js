// Consistent API success and error response helpers.
export function sendSuccess(res, statusCode = 200, message = "Success", data = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

export function sendError(res, statusCode = 500, message = "Server error", errors = [], reason = undefined, structuredError = undefined) {
  return res.status(statusCode).json({ success: false, message, ...(reason ? { reason } : {}), errors, ...(structuredError ? { error: structuredError } : {}) });
}
