// Redacted, bounded client diagnostics for unexpected frontend failures.
const STORAGE_KEY = "ss_oil_mill_frontend_errors_v1";
const MAX_REPORTS = 5;

function sanitize(value, maxLength = 3000) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[token redacted]")
    .replace(/([?&](?:token|code|otp|password|secret|key|email|phone)=)[^&#\s]*/gi, "$1[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email redacted]")
    .replace(/(?:\+?91[ -]?)?[6-9]\d{9}\b/g, "[phone redacted]")
    .slice(0, maxLength);
}

export function createSafeDiagnostic(error, context = {}) {
  return {
    type: sanitize(error?.name || "Error", 80),
    message: sanitize(error?.message || "Unexpected frontend error", 500),
    stack: sanitize(error?.stack, 4000),
    componentStack: sanitize(context.componentStack, 3000),
    boundary: sanitize(context.boundary || "window", 80),
    route: typeof window === "undefined" ? "" : sanitize(window.location.pathname, 300),
    timestamp: new Date().toISOString(),
  };
}

export function reportFrontendError(error, context = {}) {
  try {
    const diagnostic = createSafeDiagnostic(error, context);
    console.error("[FrontendError]", diagnostic);
    if (typeof sessionStorage !== "undefined") {
      const existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      const reports = Array.isArray(existing) ? existing : [];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...reports, diagnostic].slice(-MAX_REPORTS)));
    }
  } catch {
    // Error reporting must never become another application failure.
  }
}

let globalReportingInstalled = false;
export function installGlobalErrorReporting() {
  if (globalReportingInstalled || typeof window === "undefined") return;
  globalReportingInstalled = true;
  window.addEventListener("error", (event) => reportFrontendError(event.error || new Error(event.message), { boundary: "window.error" }));
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Unhandled promise rejection"));
    reportFrontendError(error, { boundary: "unhandledrejection" });
  });
}
