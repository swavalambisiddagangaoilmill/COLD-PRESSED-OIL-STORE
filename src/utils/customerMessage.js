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
  [/coupon/i, "This coupon could not be applied. Please review it and try again."],
];

export function customerMessage(error, fallback = "We could not complete that request. Please try again.") {
  const status = Number(error?.status || error?.statusCode || NaN);
  const raw = String(error?.message || "");
  if (error?.isNetworkError === true || error?.code === "NETWORK_ERROR") return statusMessages[0];
  const matched = safePatterns.find(([pattern]) => pattern.test(raw));
  if (matched) return matched[1];
  return (status !== 0 && statusMessages[status]) || (status >= 500 ? statusMessages[500] : fallback);
}

export function checkoutMessage(error) {
  const status = Number(error?.status || error?.statusCode || NaN);
  const raw = String(error?.message || "");
  const stage = error?.checkoutStage;
  if (error?.isNetworkError === true || error?.code === "NETWORK_ERROR") return "We couldn't connect. Please check your internet connection and try again. Your cart has been kept safe.";
  if (/cart.*(reconcil|cleanup|sync)/i.test(raw)) return "Your order was created, but your cart is still syncing. Check My Orders before trying again.";
  if (/already being processed/i.test(raw)) return "Your payment confirmation is still processing. Check My Orders in a moment before trying again.";
  if (/stock|quantity/i.test(raw)) return "Some items are no longer available in the requested quantity. Please review your cart.";
  if (/product.*(unavailable|not found)|items?.*(unavailable|not found)/i.test(raw)) return "Some items in your cart are no longer available. Please review your cart.";
  if (stage === "cart_preflight") return "We couldn't verify your cart right now. Please try again. Your cart has been kept safe.";
  if (stage === "payment_intent" || stage === "cashfree_initialization") return "We couldn't start the payment. Please try again. Your cart has been kept safe.";
  if (stage === "payment_cancelled") return "Payment was cancelled. Your cart is still safe.";
  if (stage === "cashfree_checkout") return "Payment could not be completed. Your cart has been kept safe. Please try again.";
  if (stage === "payment_verification") return "We couldn't confirm your payment yet. Check My Orders before trying again.";
  if (stage === "cart_cleanup") return "Your order was created, but your cart is still syncing. Check My Orders before trying again.";
  if (stage === "order_creation") return "We couldn't place your order. Your cart has been kept safe. Please try again.";
  if (/payment.*(not been completed|failed|could not be verified)/i.test(raw)) return "Payment could not be completed. Your cart has been kept safe. Please try again.";
  if (status >= 500) return "We couldn't complete your order right now. Your cart has been kept safe. Please try again.";
  return customerMessage(error, "Something went wrong while processing your checkout. Please try again. Your cart has been kept safe.");
}
