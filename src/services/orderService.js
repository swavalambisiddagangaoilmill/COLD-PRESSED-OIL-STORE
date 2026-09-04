// Handles authenticated customer order API calls.
import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";

export function fetchMyOrders() {
  return apiRequest(API_ENDPOINTS.myOrders);
}

export function fetchOrderDetails(id) {
  return apiRequest(API_ENDPOINTS.order(id));
}

export function fetchOrderTracking(id) {
  return apiRequest(API_ENDPOINTS.orderTracking(id));
}
