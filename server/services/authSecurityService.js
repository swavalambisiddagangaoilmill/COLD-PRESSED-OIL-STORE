// Centralizes user security, sessions, devices, OTPs, and login history.
import crypto from "crypto";

export function createPlainToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function getDeviceFingerprint(req) {
  return req.body?.deviceFingerprint || req.get("x-device-fingerprint") || hashValue(`${req.ip}:${req.get("user-agent") || "unknown"}`);
}

export function getDeviceDetails(req) {
  const userAgent = req.get("user-agent") || "";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Unknown browser";
  const os = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "Unknown OS";
  return { fingerprint: getDeviceFingerprint(req), ip: req.ip, userAgent, browser, os, device: /Mobile|Android|iPhone|iPad/.test(userAgent) ? "Mobile" : "Desktop", location: "Approximate location unavailable" };
}

export function pushLoginHistory(user, req, type, metadata = {}) {
  const details = getDeviceDetails(req);
  user.loginHistory = user.loginHistory || [];
  user.loginHistory.unshift({ type, ...details, metadata, createdAt: new Date() });
  user.loginHistory = user.loginHistory.slice(0, 50);
}

export function upsertSession(user, req, refreshToken, sessionId, remember = false) {
  const details = getDeviceDetails(req);
  user.sessions = user.sessions || [];
  const refreshTokenHash = hashValue(refreshToken);
  const expiresAt = new Date(Date.now() + (remember ? 30 : 7) * 24 * 60 * 60 * 1000);
  const existing = user.sessions.find((item) => item.sessionId === sessionId);
  if (existing) Object.assign(existing, details, { refreshTokenHash, lastActive: new Date(), expiresAt, revokedAt: undefined });
  else user.sessions.push({ sessionId, refreshTokenHash, ...details, loginAt: new Date(), lastActive: new Date(), expiresAt });
  user.sessions = user.sessions.filter((item) => !item.revokedAt && item.expiresAt > new Date()).slice(-12);
}

export function findSessionByRefresh(user, refreshToken) {
  const hash = hashValue(refreshToken);
  return (user.sessions || []).find((item) => item.refreshTokenHash === hash && !item.revokedAt && item.expiresAt > new Date());
}

export function revokeSession(user, sessionId) {
  (user.sessions || []).forEach((item) => { if (!sessionId || item.sessionId === sessionId) item.revokedAt = new Date(); });
}
