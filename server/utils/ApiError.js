// Custom application error with HTTP status.
export class ApiError extends Error {
  constructor(message, statusCode = 500, errors = [], reason = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.reason = reason;
    this.isOperational = true;
  }
}
