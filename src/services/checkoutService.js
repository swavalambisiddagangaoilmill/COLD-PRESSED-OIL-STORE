// Keeps order submission isolated from checkout UI.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

export async function createOrder(payload) {
  return apiRequest(API_ENDPOINTS.orders, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
