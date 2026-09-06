// Keeps order submission isolated from checkout UI.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

export async function createOrder(payload) {
  return apiRequest(API_ENDPOINTS.orders, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getShippingQuote(payload, options = {}) {
  return apiRequest(API_ENDPOINTS.shippingQuote, { method: "POST", body: JSON.stringify(payload), signal: options.signal });
}

export function getPincodeLocation(pincode, options = {}) {
  return apiRequest(API_ENDPOINTS.pincodeLookup(pincode), { signal: options.signal });
}

export async function createPaymentIntent(payload) {
  return apiRequest(API_ENDPOINTS.paymentIntent, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyPayment(payload) {
  return apiRequest(API_ENDPOINTS.paymentVerify, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPaymentStatus(cashfreeOrderId, options = {}) {
  return apiRequest(API_ENDPOINTS.paymentStatus(cashfreeOrderId), options);
}

export function getOrderConfirmation(checkoutSessionId) {
  return apiRequest(API_ENDPOINTS.orderConfirmation(checkoutSessionId));
}
