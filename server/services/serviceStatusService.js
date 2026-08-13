// Performs cached, non-destructive health checks for external integrations.
import { env } from "../config/env.js";
import cloudinary from "../config/cloudinary.js";

const CHECK_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const LABELS = {
  razorpay: "Razorpay",
  resend: "Resend",
  googleOAuth: "Google OAuth",
  cloudinary: "Cloudinary",
  shiprocket: "Shiprocket",
  ai: "AI",
  turnstile: "Turnstile",
};

let services = configurationSnapshot();
let lastCheckedAt = null;
let cacheExpiresAt = 0;
let refreshPromise = null;

function status(name, state, message) {
  return {
    name: LABELS[name] || name,
    status: state,
    available: state === "online" || state === "degraded",
    message,
  };
}

function hasAll(values) {
  return values.every((value) => Boolean(String(value || "").trim()));
}

function configurationSnapshot() {
  return {
    razorpay: hasAll([env.razorpay.keyId, env.razorpay.keySecret])
      ? status("razorpay", "degraded", "Configured; connectivity has not been checked yet.")
      : status("razorpay", "not_configured", "Not configured."),
    resend: env.email.provider === "resend" && hasAll([env.email.from, env.email.resendApiKey])
      ? status("resend", "degraded", "Configured; connectivity has not been checked yet.")
      : status("resend", "not_configured", "Not configured."),
    googleOAuth: env.oauth.googleClientId
      ? status("googleOAuth", "degraded", "Configured; provider connectivity has not been checked yet.")
      : status("googleOAuth", "not_configured", "Not configured."),
    cloudinary: hasAll([env.cloudinary.cloudName, env.cloudinary.apiKey, env.cloudinary.apiSecret])
      ? status("cloudinary", "degraded", "Configured; connectivity has not been checked yet.")
      : status("cloudinary", "not_configured", "Not configured."),
    shiprocket: env.shiprocket.mock
      ? status("shiprocket", "degraded", "Development mock mode; no live connection.")
      : hasAll([env.shiprocket.email, env.shiprocket.password])
        ? status("shiprocket", "degraded", "Configured; connectivity has not been checked yet.")
        : status("shiprocket", "not_configured", "Not configured."),
    ai: status("ai", "degraded", "Built-in fallback responses only; no external AI provider configured."),
    turnstile: env.turnstile.secretKey
      ? status("turnstile", "degraded", "Configured; connectivity has not been checked yet.")
      : status("turnstile", "not_configured", "Not configured."),
  };
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
}

async function withTimeout(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Health check timed out.")), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkRazorpay() {
  if (!hasAll([env.razorpay.keyId, env.razorpay.keySecret])) return status("razorpay", "not_configured", "Not configured.");
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64");
  try {
    const response = await fetchWithTimeout("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: `Basic ${auth}` } });
    if (response.ok) return status("razorpay", "online", "Operational; credentials verified.");
    if (response.status === 401) return status("razorpay", "offline", "Authentication failed.");
    if (response.status === 403) return status("razorpay", "degraded", "Credentials were accepted, but account access is restricted.");
    return status("razorpay", "degraded", "Provider responded, but the account check was unavailable.");
  } catch {
    return status("razorpay", "offline", "Connection failed.");
  }
}

function senderDomain() {
  const address = String(env.email.from || "").match(/<?([^<>\s]+@[^<>\s]+)>?$/)?.[1];
  return address?.split("@")[1]?.toLowerCase() || "";
}

async function checkResend() {
  if (env.email.provider !== "resend" || !hasAll([env.email.from, env.email.resendApiKey])) return status("resend", "not_configured", "Not configured.");
  try {
    const response = await fetchWithTimeout("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.email.resendApiKey}` } });
    if (response.status === 401) return status("resend", "offline", "Authentication failed.");
    if (response.status === 403) return status("resend", "degraded", "API key is restricted; live sending must be verified separately.");
    if (!response.ok) return status("resend", "degraded", "Provider responded, but sender verification could not be confirmed.");
    const payload = await response.json().catch(() => ({}));
    const domain = senderDomain();
    if (domain === "resend.dev") return status("resend", "online", "Operational with the Resend test sender.");
    const configuredDomain = (payload.data || []).find((item) => String(item.name || "").toLowerCase() === domain);
    if (!configuredDomain) return status("resend", "degraded", "Credentials work, but the sender domain was not found.");
    if (configuredDomain.status !== "verified") return status("resend", "degraded", "Sender domain is not verified.");
    return status("resend", "online", "Operational; sender domain verified.");
  } catch {
    return status("resend", "offline", "Connection failed.");
  }
}

async function checkGoogleOAuth() {
  if (!env.oauth.googleClientId) return status("googleOAuth", "not_configured", "Not configured.");
  if (!String(env.oauth.googleClientId).endsWith(".apps.googleusercontent.com")) return status("googleOAuth", "offline", "Client configuration is invalid.");
  try {
    const response = await fetchWithTimeout("https://accounts.google.com/.well-known/openid-configuration");
    if (!response.ok) return status("googleOAuth", "offline", "Google identity service is unavailable.");
    return status("googleOAuth", "degraded", "Provider reachable; client authorization requires a real sign-in to verify.");
  } catch {
    return status("googleOAuth", "offline", "Connection failed.");
  }
}

async function checkCloudinary() {
  if (!hasAll([env.cloudinary.cloudName, env.cloudinary.apiKey, env.cloudinary.apiSecret])) return status("cloudinary", "not_configured", "Not configured.");
  try {
    const result = await withTimeout(cloudinary.api.ping());
    return result?.status === "ok"
      ? status("cloudinary", "online", "Operational; credentials verified.")
      : status("cloudinary", "degraded", "Provider responded, but health was not confirmed.");
  } catch (error) {
    const code = Number(error?.http_code || error?.statusCode || 0);
    return status("cloudinary", "offline", code === 401 || code === 403 ? "Authentication failed." : "Connection failed.");
  }
}

async function checkShiprocket() {
  if (env.shiprocket.mock) return status("shiprocket", "degraded", "Development mock mode; no live connection.");
  if (!hasAll([env.shiprocket.email, env.shiprocket.password])) return status("shiprocket", "not_configured", "Not configured.");
  try {
    const response = await fetchWithTimeout("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
    });
    if (response.status === 401 || response.status === 403 || response.status === 422) return status("shiprocket", "offline", "Authentication failed.");
    if (!response.ok) return status("shiprocket", "degraded", "Provider responded, but account health was not confirmed.");
    const payload = await response.json().catch(() => ({}));
    if (!payload.token) return status("shiprocket", "degraded", "Authentication response was incomplete.");
    if (!hasAll([env.shiprocket.pickupLocation, env.shiprocket.pickupPostcode])) return status("shiprocket", "degraded", "Credentials work, but pickup configuration is incomplete.");
    return status("shiprocket", "online", "Operational; credentials verified.");
  } catch {
    return status("shiprocket", "offline", "Connection failed.");
  }
}

async function checkTurnstile() {
  if (!env.turnstile.secretKey) return status("turnstile", "not_configured", "Not configured.");
  try {
    const body = new URLSearchParams({ secret: env.turnstile.secretKey, response: "service-status-health-check" });
    const response = await fetchWithTimeout("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    if (!response.ok) return status("turnstile", "offline", "Cloudflare verification service is unavailable.");
    const payload = await response.json().catch(() => ({}));
    const codes = payload["error-codes"] || [];
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) return status("turnstile", "offline", "Secret key validation failed.");
    if (codes.includes("invalid-input-response") || codes.includes("timeout-or-duplicate")) return status("turnstile", "online", "Operational; secret key accepted.");
    return status("turnstile", "degraded", "Provider reachable; configuration could not be fully verified.");
  } catch {
    return status("turnstile", "offline", "Connection failed.");
  }
}

async function refreshServiceStatus() {
  const results = await Promise.all([
    checkRazorpay(),
    checkResend(),
    checkGoogleOAuth(),
    checkCloudinary(),
    checkShiprocket(),
    Promise.resolve(status("ai", "degraded", "Built-in fallback responses only; no external AI provider configured.")),
    checkTurnstile(),
  ]);
  services = Object.fromEntries(Object.keys(LABELS).map((key, index) => [key, results[index]]));
  lastCheckedAt = new Date().toISOString();
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return { checkedAt: lastCheckedAt, cacheExpiresAt: new Date(cacheExpiresAt).toISOString(), services };
}

export async function getServiceStatus({ force = false } = {}) {
  if (!force && lastCheckedAt && Date.now() < cacheExpiresAt) return { checkedAt: lastCheckedAt, cacheExpiresAt: new Date(cacheExpiresAt).toISOString(), services };
  if (!refreshPromise) refreshPromise = refreshServiceStatus().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export function isServiceAvailable(name) {
  return services[name]?.available === true;
}

export function startServiceStatusMonitor() {
  getServiceStatus({ force: true }).catch((error) => console.error("Service status refresh failed", { message: error.message }));
  const timer = setInterval(() => getServiceStatus({ force: true }).catch((error) => console.error("Service status refresh failed", { message: error.message })), CACHE_TTL_MS);
  timer.unref?.();
  return timer;
}

export function logExternalFailure(service, error, context = {}) {
  if (services[service]) services[service] = status(service, "offline", "Connection failed.");
  cacheExpiresAt = Math.min(cacheExpiresAt, Date.now() + 60 * 1000);
  console.error(`[External Service Failure] ${service}`, {
    message: error?.message || String(error),
    name: error?.name,
    statusCode: error?.statusCode,
    context,
  });
}
