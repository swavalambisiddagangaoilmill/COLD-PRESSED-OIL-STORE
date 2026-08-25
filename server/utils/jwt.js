// JWT utility functions.
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";

export function signToken(userId, sessionId) {
  return jwt.sign({ id: userId, ...(sessionId ? { sessionId } : {}) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function signRefreshToken(userId, sessionId) {
  return jwt.sign({ id: userId, type: "refresh", ...(sessionId ? { sessionId } : {}) }, env.jwtSecret, { expiresIn: env.refreshExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function usesSecureCrossSiteCookies() {
  return env.isProduction || env.backendPublicUrl.startsWith("https://");
}

function cookieSecurityOptions(httpOnly) {
  const crossSite = usesSecureCrossSiteCookies();
  return { httpOnly, secure: crossSite, sameSite: crossSite ? "none" : "lax" };
}

export function setAuthCookie(res, token) {
  const csrfToken = crypto.randomBytes(24).toString("hex");
  res.cookie("token", token, {
    ...cookieSecurityOptions(true),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie("csrfToken", csrfToken, {
    ...cookieSecurityOptions(false),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    ...cookieSecurityOptions(true),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie("token", cookieSecurityOptions(true));
  res.clearCookie("refreshToken", cookieSecurityOptions(true));
  res.clearCookie("csrfToken", cookieSecurityOptions(false));
}
