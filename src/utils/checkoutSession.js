export const PENDING_PAYMENT_KEY = "ss_cashfree_pending_payment";

function read(key) {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.sessionStorage.getItem(key) || "null"); }
  catch { return null; }
}

export function newCheckoutSessionId() {
  return window.crypto.randomUUID();
}

export function cartFingerprint(items = []) {
  return items
    .map((item) => `${item._id || item.id}:${item.variantId || ""}:${Number(item.quantity) || 0}`)
    .sort()
    .join("|");
}

export function readPendingPayment() {
  return read(PENDING_PAYMENT_KEY);
}

export function paymentSessionFromSearch(search = "") {
  const params = new URLSearchParams(search);
  return params.get("payment_return") || params.get("payment_pending") || "";
}

export function resumablePendingPayment(search = "") {
  const pending = readPendingPayment();
  const requestedSession = paymentSessionFromSearch(search);
  return pending?.checkoutSessionId && requestedSession === pending.checkoutSessionId ? pending : null;
}

export function clearPendingPayment() {
  window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
}

export function writePendingPayment(payment) {
  window.sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payment));
}
