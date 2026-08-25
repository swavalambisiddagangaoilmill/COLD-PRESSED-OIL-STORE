// Wraps HTTP requests so backend details stay out of UI components.
import { API_BASE_URL } from "../constants/apiConfig.js";

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];
const DEFAULT_READ_TIMEOUT_MS = 15000;
const TRANSIENT_STATUS = new Set([408, 425]);

const wait = (delay) => new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(0, delay), 8000)));
const isSafeRead = (method) => method === "GET" || method === "HEAD";
const isTransientStatus = (status) => status === 0 || TRANSIENT_STATUS.has(status) || status >= 500;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  if (externalSignal?.aborted) throw externalSignal.reason || new DOMException("Request aborted", "AbortError");
  const abortFromCaller = () => controller.abort(externalSignal.reason || new DOMException("Request aborted", "AbortError"));
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs) : null;
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function notifyAuthChange() {
  window.dispatchEvent(new Event("ss-oil-mill-auth-change"));
}

export function getAuthToken() {
  return hasCookieSession ? "cookie-session" : null;
}

function getCookie(name) {
  if (typeof document === "undefined") return "";
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
  const { retry, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const hasBody = typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const csrfToken = mutating ? getCookie("csrfToken") : "";
  const headers = {
    ...(hasBody ? {} : { "Content-Type": "application/json" }),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...requestOptions.headers,
  };
  const retryEnabled = retry !== false && (isSafeRead(method) || (retry?.enabled === true && retry?.idempotent === true));
  const retryDelays = retryEnabled ? (retry?.delays || DEFAULT_RETRY_DELAYS) : [];
  const timeoutMs = retry?.timeoutMs ?? (isSafeRead(method) ? DEFAULT_READ_TIMEOUT_MS : 0);
  let attempt = 0;

  while (true) {
    let response;
    let networkCause;
    try {
      response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, { credentials: "include", ...requestOptions, headers }, timeoutMs);
    } catch (error) {
      if (requestOptions.signal?.aborted) throw error;
      networkCause = error;
    }

    const status = response?.status || 0;
    if ((!response || !response.ok) && retryEnabled && isTransientStatus(status) && attempt < retryDelays.length) {
      await wait(retryDelays[attempt]);
      attempt += 1;
      continue;
    }

    if (!response) {
      const error = new Error("Something went wrong. Please try again.");
      error.status = 0;
      error.cause = networkCause;
      error.attempts = attempt + 1;
      error.retryExhausted = retryEnabled;
      throw error;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const transientExhausted = retryEnabled && isTransientStatus(response.status);
      const message = transientExhausted
        ? "Something went wrong. Please try again."
        : payload.message || (response.status === 429 ? "Rate limit reached. Please retry after a short pause." : `API request failed: ${response.status}`);
      const error = new Error(message);
      error.status = response.status;
      error.errors = payload.errors || [];
      error.reason = payload.reason;
      error.payload = payload;
      error.attempts = attempt + 1;
      error.retryExhausted = transientExhausted;
      throw error;
    }
    return payload.data ?? payload;
  }
}



let hasCookieSession = false;
