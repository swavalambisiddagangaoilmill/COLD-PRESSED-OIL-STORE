// Handles authenticated customer order API calls.
import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { API_BASE_URL } from "../constants/apiConfig.js";
import { getAuthToken } from "../api/apiClient.js";

export function fetchMyOrders() {
  return apiRequest(API_ENDPOINTS.myOrders);
}

export function fetchOrderDetails(id) {
  return apiRequest(API_ENDPOINTS.order(id));
}

export function fetchOrderTracking(id) {
  return apiRequest(API_ENDPOINTS.orderTracking(id));
}

export async function downloadOrderInvoice(id) {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.orderInvoice(id)}`, { credentials: "include", headers: { Authorization: `Bearer ${getAuthToken()}` } });
  if (!response.ok) throw new Error("Invoice could not be downloaded.");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `Invoice-${id}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
