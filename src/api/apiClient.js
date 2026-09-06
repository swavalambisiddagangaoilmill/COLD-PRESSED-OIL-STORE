// Wraps HTTP requests so backend details stay out of UI components.
import { API_BASE_URL } from "../constants/apiConfig.js";

const TOKEN_KEY = "ss_oil_mill_token";
const REFRESH_KEY = "ss_oil_mill_refresh_token";
const pendingReads = new Map();
const READ_RETRY_DELAYS = [200, 600];
let recoveryRequestId = 0;

function transientReadFailure(error) {
  return error?.isNetworkError || [408, 425, 500, 502, 503, 504].includes(Number(error?.status));
}

function recoveryEvent(phase, detail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(`ss-oil-mill-recovery-${phase}`, { detail }));
}

const wait = (delay) => new Promise((resolve) => window.setTimeout(resolve, delay));

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
    if (error?.name === "AbortError") throw error;
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
  if (!["GET", "HEAD"].includes(method)) return executeRequest(endpoint, options, token);
  const key = `${token || "guest"}:${method}:${endpoint}`;
  if (pendingReads.has(key)) return pendingReads.get(key);
  const requestId = ++recoveryRequestId;
  const executeRead = async () => {
    let recoveryStarted = false;
    let recoveryResult = "exhausted";
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const result = await executeRequest(endpoint, options, token);
          recoveryResult = "recovered";
          return result;
        } catch (error) {
          if (error?.name === "AbortError" || !transientReadFailure(error) || attempt >= READ_RETRY_DELAYS.length) throw error;
          if (!recoveryStarted) {
            recoveryStarted = true;
            recoveryEvent("start", { requestId, attempt: 1, maximum: READ_RETRY_DELAYS.length });
          } else {
            recoveryEvent("progress", { requestId, attempt: attempt + 1, maximum: READ_RETRY_DELAYS.length });
          }
          await wait(READ_RETRY_DELAYS[attempt]);
        }
      }
    } finally {
      if (recoveryStarted) recoveryEvent("end", { requestId, result: recoveryResult });
    }
  };
  const request = executeRead().finally(() => pendingReads.delete(key));
  pendingReads.set(key, request);
  return request;
}



