// Wraps HTTP requests so backend details stay out of UI components.
import { API_BASE_URL } from "../constants/apiConfig.js";

function notifyAuthChange() {
  window.dispatchEvent(new Event("ss-oil-mill-auth-change"));
}

export function getAuthToken() {
  return hasCookieSession ? "cookie-session" : null;
}

function getCookie(name) {
  return document.cookie.split("; ").find((row) => row.startsWith(`${name}=`))?.split("=")[1] || "";
}

export function setAuthTokens(token, refreshToken) {
  hasCookieSession = true;
  notifyAuthChange();
}

export function clearAuthTokens() {
  hasCookieSession = false;
  notifyAuthChange();
}

export async function apiRequest(endpoint, options = {}) {
  const hasBody = options.body instanceof FormData;
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase());
  const csrfToken = mutating ? getCookie("csrfToken") : "";
  const headers = {
    ...(hasBody ? {} : { "Content-Type": "application/json" }),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...options.headers,
  };
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { credentials: "include", ...options, headers });
  } catch (error) {
    const networkError = new Error("Service is temporarily unavailable. Please try again shortly.");
    networkError.status = 0;
    networkError.cause = error;
    throw networkError;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.message || (response.status === 429 ? "Rate limit reached. Please retry after a short pause." : `API request failed: ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.errors = payload.errors || [];
    error.reason = payload.reason;
    error.payload = payload;
    throw error;
  }
  return payload.data ?? payload;
}



let hasCookieSession = false;
