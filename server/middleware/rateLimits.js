import rateLimit from "express-rate-limit";

const response = (message) => ({ success: false, message, errors: [] });
const skipOptions = (req) => req.method === "OPTIONS";
const adminKey = (req) => `admin:${String(req.user._id)}:${String(req.authSessionId || "session")}`;

export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipOptions(req) || /^\/api\/admin(?:-panel)?(?:\/|$)/.test(req.originalUrl),
  message: response("Too many requests. Please wait a moment and try again."),
});

export function createAdminLimiters({ readLimit = 600, mutationLimit = 100 } = {}) {
  return {
    read: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: readLimit,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: adminKey,
      skip: (req) => skipOptions(req) || !["GET", "HEAD"].includes(req.method),
      message: response("Too many admin requests. Please wait a moment and try again."),
    }),
    mutation: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: mutationLimit,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: adminKey,
      skip: (req) => skipOptions(req) || ["GET", "HEAD"].includes(req.method),
      message: response("Too many admin changes. Please wait a moment and try again."),
    }),
  };
}

const adminLimiters = createAdminLimiters();
export const adminReadLimiter = adminLimiters.read;
export const adminMutationLimiter = adminLimiters.mutation;
