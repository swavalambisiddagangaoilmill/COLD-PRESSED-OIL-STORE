// Admin session service for max-device enforcement and management.
import crypto from "crypto";
import AdminSession from "../models/AdminSession.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { createAdminNotification } from "./adminNotificationService.js";

const MAX_ADMIN_SESSIONS = 3;
const hash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const availableSlot = (sessions) => {
  const used = new Set(sessions.map((session) => session.slot).filter(Number.isInteger));
  return Array.from({ length: MAX_ADMIN_SESSIONS }, (_, index) => index + 1).find((slot) => !used.has(slot));
};

function parseDevice(req) {
  const ua = req.get("user-agent") || "Unknown browser";
  const browser = /Edg/i.test(ua) ? "Edge" : /Chrome/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Browser";
  const os = /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Linux/i.test(ua) ? "Linux" : "Unknown OS";
  return { userAgent: ua, browser, os, deviceName: `${browser} on ${os}`, ip: req.ip, location: req.get("x-vercel-ip-city") || req.get("x-location") || "Approximate location unavailable" };
}

function publicSession(session, currentSessionId) {
  return {
    id: session._id,
    sessionId: session.sessionId,
    deviceName: session.deviceName,
    browser: session.browser,
    os: session.os,
    ip: session.ip,
    location: session.location,
    loginAt: session.loginAt,
    lastActiveAt: session.lastActiveAt,
    current: session.sessionId === currentSessionId,
  };
}

export async function assertAdminSessionCapacity(req, admin) {
  if (admin.role !== "admin") return { allowed: true };
  const active = await AdminSession.find({ admin: admin._id, status: "active", expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 });
  if (active.length < MAX_ADMIN_SESSIONS) return { allowed: true };
  const pendingToken = crypto.randomBytes(32).toString("hex");
  const sessionId = crypto.randomUUID();
  await AdminSession.create({ admin: admin._id, status: "pending", sessionId, pendingTokenHash: hash(pendingToken), refreshTokenHash: hash(`${sessionId}:refresh`), ...parseDevice(req), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  throw new ApiError("Maximum active admin sessions reached.", 409, [{ code: "ADMIN_SESSION_LIMIT", pendingToken, sessions: active.map((session) => publicSession(session)) }]);
}

export async function createAdminSession(req, admin, refreshToken) {
  if (admin.role !== "admin") return null;
  const active = await AdminSession.find({ admin: admin._id, status: "active", expiresAt: { $gt: new Date() } }).select("slot").lean();
  const slot = availableSlot(active);
  if (!slot) throw new ApiError("Maximum active admin sessions reached.", 409, [{ code: "ADMIN_SESSION_LIMIT" }]);
  const sessionId = crypto.randomUUID();
  const session = await AdminSession.create({ admin: admin._id, status: "active", sessionId, slot, pendingTokenHash: hash(`${sessionId}:pending`), refreshTokenHash: hash(refreshToken || `${sessionId}:refresh`), loginAt: new Date(), lastActiveAt: new Date(), ...parseDevice(req) });
  await createAdminNotification({ category: "security", type: "admin_login", title: "Admin Login", description: `${admin.email} signed in on ${session.deviceName}.`, related: { kind: "User", id: admin._id, label: admin.email, path: "/admin/settings" } });
  return session;
}

export async function touchAdminSession(sessionId) {
  if (sessionId) await AdminSession.updateOne({ sessionId, status: "active" }, { lastActiveAt: new Date() });
}

export async function revokeAdminSessions(adminId, sessionIds = [], reason = "manual") {
  const filter = { admin: adminId, status: "active" };
  if (sessionIds.length) filter.sessionId = { $in: sessionIds };
  const sessions = await AdminSession.find(filter);
  await AdminSession.updateMany(filter, { status: "revoked", revokedAt: new Date(), revokeReason: reason });
  if (sessions.length) {
    await createAdminNotification({ category: "security", type: "admin_session_revoked", title: "Admin Session Revoked", description: `${sessions.length} admin session${sessions.length > 1 ? "s were" : " was"} signed out.`, dedupeKey: `admin-session-revoked:${adminId}:${Date.now()}`, related: { kind: "User", id: adminId, label: "Admin sessions", path: "/admin/settings" } });
  }
  return sessions.length;
}

export async function continuePendingAdminLogin(req, pendingToken, revokeSessionIds = []) {
  const pending = await AdminSession.findOne({ pendingTokenHash: hash(pendingToken), status: "pending", expiresAt: { $gt: new Date() } }).select("+pendingTokenHash");
  if (!pending) throw new ApiError("Pending admin login has expired.", 400);
  if (revokeSessionIds.length) await revokeAdminSessions(pending.admin, revokeSessionIds, "login_device_limit");
  const active = await AdminSession.find({ admin: pending.admin, status: "active", expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 });
  if (active.length >= MAX_ADMIN_SESSIONS) {
    throw new ApiError("Maximum active admin sessions reached.", 409, [{ code: "ADMIN_SESSION_LIMIT", pendingToken, sessions: active.map((session) => publicSession(session)) }]);
  }
  pending.status = "active";
  pending.slot = availableSlot(active);
  pending.loginAt = new Date();
  pending.lastActiveAt = new Date();
  pending.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pending.save();
  const admin = await User.findById(pending.admin).select("+refreshToken");
  return { admin, session: pending };
}

export async function attachRefreshToken(sessionId, refreshToken) {
  await AdminSession.updateOne({ sessionId }, { refreshTokenHash: hash(refreshToken) });
}

export async function listAdminSessions(adminId, currentSessionId) {
  const sessions = await AdminSession.find({ admin: adminId, status: "active", expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 });
  const history = await AdminSession.find({ admin: adminId }).sort({ createdAt: -1 }).limit(10);
  return { max: MAX_ADMIN_SESSIONS, active: sessions.map((session) => publicSession(session, currentSessionId)), history: history.map((session) => ({ ...publicSession(session, currentSessionId), status: session.status, revokedAt: session.revokedAt })) };
}
