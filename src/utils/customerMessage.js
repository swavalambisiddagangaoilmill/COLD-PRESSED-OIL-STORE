const statusMessages = {
  0: "We could not connect. Check your internet connection and try again.",
  400: "Please review the information and try again.",
  401: "Please sign in to continue.",
  403: "You do not have permission to complete this action.",
  404: "This item is no longer available.",
  409: "This request has already been processed. Refresh and try again.",
  422: "Please correct the highlighted information.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again shortly.",
  502: "A connected service is temporarily unavailable. Please try again.",
  503: "This service is temporarily unavailable. Please try again shortly.",
};

const safePatterns = [
  [/stock/i, "The requested quantity is no longer available. Please review your cart."],
  [/unavailable|not found/i, "This item is no longer available."],
  [/payment.*(failed|complete|verified)|cashfree/i, "Payment could not be completed. Your cart has not been changed."],
  [/network|fetch|connect/i, statusMessages[0]],
  [/coupon/i, "This coupon could not be applied. Please review it and try again."],
];

export function customerMessage(error, fallback = "We could not complete that request. Please try again.") {
  const status = Number(error?.status || error?.statusCode || 0);
  const raw = String(error?.message || "");
  const matched = safePatterns.find(([pattern]) => pattern.test(raw));
  if (matched) return matched[1];
  return statusMessages[status] || (status >= 500 ? statusMessages[500] : fallback);
}
