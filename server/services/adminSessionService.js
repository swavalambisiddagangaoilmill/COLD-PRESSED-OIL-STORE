// Admin session service for max-device enforcement and management.
import crypto from "crypto";
import AdminSession from "../models/AdminSession.js";
import { ApiError } from "../utils/ApiError.js";
import { createAdminNotification } from "./adminNotificationService.js";

export const MAX_ADMIN_SESSIONS = 5;
const hash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const limitMessage = "Maximum of 5 active devices reached. Please log out from another device before logging in here.";

export function availableAdminSessionSlots(active = []) {
  const occupied = new Set(active.map((session) => Number(session.slot)).filter(Boolean));
  return Array.from({ length: MAX_ADMIN_SESSIONS }, (_, index) => index + 1).filter((slot) => !occupied.has(slot));
}

export function adminSessionRecordIsActive(session, now = new Date()) {
  return Boolean(session && session.status === "active" && new Date(session.expiresAt) > now);
}

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

export async function expireAdminSessions(adminId, now = new Date()) {
  await AdminSession.updateMany({ admin: adminId, status: "active", expiresAt: { $lte: now } }, { status: "expired", revokeReason: "natural_expiry" });
}

export async function createAdminSession(req, admin) {
  if (admin.role !== "admin") return null;
  const now = new Date();
  await expireAdminSessions(admin._id, now);
  const active = await AdminSession.find({ admin: admin._id, status: "active" }).select("slot").lean();
  const availableSlots = availableAdminSessionSlots(active);
  if (!availableSlots.length) throw new ApiError(limitMessage, 409, [{ code: "ADMIN_SESSION_LIMIT" }]);
  let session;
  for (const slot of availableSlots) {
    try {
      session = await AdminSession.create({ admin: admin._id, status: "active", slot, sessionId: crypto.randomUUID(), loginAt: now, lastActiveAt: now, ...parseDevice(req) });
      break;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  if (!session) throw new ApiError(limitMessage, 409, [{ code: "ADMIN_SESSION_LIMIT" }]);
  const adminLabel = admin.email || admin.phone || admin.name || "Admin";
  await createAdminNotification({ category: "security", type: "admin_login", title: "Admin Login", description: `${adminLabel} signed in on ${session.deviceName}.`, related: { kind: "User", id: admin._id, label: adminLabel, path: "/admin/settings" } });
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

export async function attachRefreshToken(sessionId, refreshToken) {
  await AdminSession.updateOne({ sessionId }, { refreshTokenHash: hash(refreshToken) });
}

export async function findAdminSessionByRefresh(adminId, sessionId, refreshToken) {
  if (!sessionId) return null;
  const session = await AdminSession.findOne({ admin: adminId, sessionId, status: "active", expiresAt: { $gt: new Date() } }).select("+refreshTokenHash");
  return session?.refreshTokenHash === hash(refreshToken) ? session : null;
}

export async function isAdminSessionActive(adminId, sessionId) {
  if (!sessionId) return false;
  return Boolean(await AdminSession.exists({ admin: adminId, sessionId, status: "active", expiresAt: { $gt: new Date() } }));
}

export async function listAdminSessions(adminId, currentSessionId) {
  await expireAdminSessions(adminId);
  const sessions = await AdminSession.find({ admin: adminId, status: "active", expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 });
  const history = await AdminSession.find({ admin: adminId }).sort({ createdAt: -1 }).limit(10);
  return { max: MAX_ADMIN_SESSIONS, active: sessions.map((session) => publicSession(session, currentSessionId)), history: history.map((session) => ({ ...publicSession(session, currentSessionId), status: session.status, revokedAt: session.revokedAt })) };
}
