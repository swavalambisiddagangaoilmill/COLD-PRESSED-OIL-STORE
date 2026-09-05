// Wraps HTTP requests so backend details stay out of UI components.
import { API_BASE_URL } from "../constants/apiConfig.js";

const TOKEN_KEY = "ss_oil_mill_token";
const REFRESH_KEY = "ss_oil_mill_refresh_token";
const pendingReads = new Map();

function notifyAuthChange() {
  window.dispatchEvent(new Event("ss-oil-mill-auth-change"));
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCookie(name) {
  return document.cookie.split("; ").find((row) => row.startsWith(`${name}=`))?.split("=")[1] || "";
}

export function setAuthTokens(token, refreshToken) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  notifyAuthChange();
}

export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  notifyAuthChange();
}

async function executeRequest(endpoint, options, token) {
  const hasBody = options.body instanceof FormData;
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase());
  const csrfToken = mutating ? getCookie("csrfToken") : "";
  const headers = {
    ...(hasBody ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...options.headers,
  };
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { credentials: "include", ...options, headers });
  } catch (error) {
    const networkError = new Error("Service is temporarily unavailable. Please try again shortly.");
    networkError.status = 0;
    networkError.code = "NETWORK_ERROR";
    networkError.isNetworkError = true;
    networkError.cause = error;
    throw networkError;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldMessage = Array.isArray(payload.errors) ? payload.errors.find((item) => typeof item?.message === "string")?.message : "";
    const backendMessage = payload.message === "Validation failed." && fieldMessage ? fieldMessage : payload.message;
    const message = backendMessage || (response.status === 429 ? "Too many requests. Please wait a moment and try again." : `API request failed: ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.errors = payload.errors || [];
    error.reason = payload.reason;
    error.payload = payload;
    throw error;
  }
  return payload.data ?? payload;
}

export function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") return executeRequest(endpoint, options, token);
  const key = `${token || "guest"}:${endpoint}`;
  if (pendingReads.has(key)) return pendingReads.get(key);
  const request = executeRequest(endpoint, options, token).finally(() => pendingReads.delete(key));
  pendingReads.set(key, request);
  return request;
}



