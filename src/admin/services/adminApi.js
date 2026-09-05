// Admin API service layer using the existing shared API client.
import { apiRequest, getAuthToken } from "../../api/apiClient.js";
import { API_BASE_URL } from "../../constants/apiConfig.js";

const base = "/admin-panel";
const promotionChanged = (request) => request.then((result) => { window.dispatchEvent(new Event("ss-oil-mill-promotions-changed")); return result; });
async function downloadFulfillmentExport() {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${base}/fulfillment/export`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || "Unable to download the order list."); }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "shipment-attention.xlsx";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}
async function openShipmentDocument(id, type) {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  const token = getAuthToken();
  try {
    const response = await fetch(`${API_BASE_URL}${base}/orders/${id}/documents/${type}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || "Unable to open shipment document."); }
    const url = URL.createObjectURL(await response.blob());
    if (popup) popup.location.href = url;
    else { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click(); }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) { popup?.close(); throw error; }
}

export const adminApi = {
  search: (q) => apiRequest(`${base}/search?q=${encodeURIComponent(q)}`),
  dashboard: () => apiRequest(`${base}/dashboard`),
  serviceStatus: () => apiRequest("/service-status"),
  orders: (query = "") => apiRequest(`${base}/orders${query}`),
  orderStatus: (id, status) => apiRequest(`${base}/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  readyToShip: (id) => apiRequest(`${base}/orders/${id}/ready-to-ship`, { method: "POST" }),
  requestPickup: (id) => apiRequest(`${base}/orders/${id}/request-pickup`, { method: "POST" }),
  cancelShipment: (id) => apiRequest(`${base}/orders/${id}/cancel-shipment`, { method: "POST" }),
  refreshTracking: (id) => apiRequest(`/orders/${id}/tracking`),
  fulfillment: (query = "") => apiRequest(`${base}/fulfillment${query}`),
  bulkReadyToShip: (orderIds) => apiRequest(`${base}/fulfillment/ready`, { method: "POST", body: JSON.stringify({ orderIds }) }),
  generateManifest: (orderIds) => apiRequest(`${base}/fulfillment/manifest`, { method: "POST", body: JSON.stringify({ orderIds }) }),
  printManifest: (orderIds) => apiRequest(`${base}/fulfillment/manifest/print`, { method: "POST", body: JSON.stringify({ orderIds }) }),
  generateLabel: (id) => apiRequest(`${base}/orders/${id}/label`, { method: "POST" }),
  generateShipmentInvoice: (id) => apiRequest(`${base}/orders/${id}/shipment-invoice`, { method: "POST" }),
  openShipmentDocument,
  downloadFulfillmentExport,
  handoverShipment: (id) => apiRequest(`${base}/orders/${id}/handover`, { method: "POST" }),
  products: (query = "") => apiRequest(`${base}/products${query}`),
  saveProduct: (payload, id) => apiRequest(id ? `${base}/products/${id}` : `${base}/products`, { method: id ? "PUT" : "POST", body: JSON.stringify(payload) }),
  archiveProduct: (id) => apiRequest(`${base}/products/${id}`, { method: "DELETE" }),
  uploadImage: (file, folder = "products") => {
    const form = new FormData();
    form.append("image", file);
    form.append("folder", folder);
    return apiRequest("/upload/image", { method: "POST", body: form });
  },
  carousel: () => apiRequest("/admin/carousel"),
  saveCarousel: ({ id, imageFile, removeImage = false, isActive = true, requestKey }) => {
    const form = new FormData();
    if (imageFile) form.append("image", imageFile);
    form.append("removeImage", String(removeImage));
    form.append("isActive", String(isActive));
    if (requestKey) form.append("requestKey", requestKey);
    return promotionChanged(apiRequest(id ? `/admin/carousel/${id}` : "/admin/carousel", { method: id ? "PUT" : "POST", body: form }));
  },
  carouselStatus: (id, isActive) => promotionChanged(apiRequest(`/admin/carousel/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) })),
  deleteCarousel: (id) => promotionChanged(apiRequest(`/admin/carousel/${id}`, { method: "DELETE" })),
  reorderCarousel: (ids) => promotionChanged(apiRequest("/admin/carousel/reorder", { method: "PATCH", body: JSON.stringify({ ids }) })),
  bulkPreview: (payload) => apiRequest(`${base}/products/bulk-price/preview`, { method: "POST", body: JSON.stringify(payload) }),
  bulkApply: (payload) => apiRequest(`${base}/products/bulk-price/apply`, { method: "POST", body: JSON.stringify(payload) }),
  inventory: (id, payload) => apiRequest(`${base}/inventory/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  categories: () => apiRequest(`${base}/categories`),
  gallery: () => apiRequest("/admin/gallery"),
  saveGalleryImage: (payload, id) => apiRequest(id ? `/admin/gallery/${id}` : "/admin/gallery", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) }),
  deleteGalleryImage: (id) => apiRequest(`/admin/gallery/${id}`, { method: "DELETE" }),
  reorderGallery: (ids) => apiRequest("/admin/gallery/reorder", { method: "PUT", body: JSON.stringify({ ids }) }),
  saveCategory: (payload, id) => apiRequest(id ? `${base}/categories/${id}` : `${base}/categories`, { method: id ? "PUT" : "POST", body: JSON.stringify(payload) }),
  offers: () => apiRequest(`${base}/offers`),
  createOffer: (payload) => promotionChanged(apiRequest(`${base}/offers`, { method: "POST", body: JSON.stringify(payload) })),
  updateOffer: (id, payload) => promotionChanged(apiRequest(`${base}/offers/${id}`, { method: "PUT", body: JSON.stringify(payload) })),
  deleteOffer: (id) => promotionChanged(apiRequest(`${base}/offers/${id}`, { method: "DELETE" })),
  coupons: () => apiRequest(`${base}/coupons`),
  createCoupon: (payload) => promotionChanged(apiRequest(`${base}/coupons`, { method: "POST", body: JSON.stringify(payload) })),
  updateCoupon: (id, payload) => promotionChanged(apiRequest(`${base}/coupons/${id}`, { method: "PUT", body: JSON.stringify(payload) })),
  deleteCoupon: (id) => promotionChanged(apiRequest(`${base}/coupons/${id}`, { method: "DELETE" })),
  shipping: () => apiRequest(`${base}/shipping`),
  customers: () => apiRequest(`${base}/customers`),
  payments: () => apiRequest(`${base}/payments`),
  messages: () => apiRequest(`${base}/messages`),
  messageStatus: (id, status) => apiRequest(`${base}/messages/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  reports: (type = "sales") => apiRequest(`${base}/reports?type=${type}`),
  users: () => apiRequest(`${base}/users`),
  updateUser: (id, adminRole) => apiRequest(`${base}/users/${id}`, { method: "PUT", body: JSON.stringify({ adminRole }) }),
  auditLogs: () => apiRequest(`${base}/audit-logs`),
  restrictions: (q = "") => apiRequest(`${base}/restrictions${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  restriction: (id) => apiRequest(`${base}/restrictions/${id}`),
  removeRestriction: (id, reason) => apiRequest(`${base}/restrictions/${id}/remove`, { method: "POST", body: JSON.stringify({ reason }) }),
  extendRestriction: (id, payload) => apiRequest(`${base}/restrictions/${id}/extend`, { method: "POST", body: JSON.stringify(payload) }),
  addRestrictionNote: (id, note) => apiRequest(`${base}/restrictions/${id}/notes`, { method: "POST", body: JSON.stringify({ note }) }),
  notifications: (query = "") => apiRequest(`${base}/notifications${query}`),
  markNotification: (id, read = true) => apiRequest(`${base}/notifications/${id}/read`, { method: "PUT", body: JSON.stringify({ read }) }),
  deleteNotification: (id) => apiRequest(`${base}/notifications/${id}`, { method: "DELETE" }),
  markAllNotificationsRead: () => apiRequest(`${base}/notifications/mark-all-read`, { method: "POST" }),
  clearReadNotifications: () => apiRequest(`${base}/notifications/clear-read`, { method: "DELETE" }),
  notificationPreferences: () => apiRequest(`${base}/notification-preferences`),
  saveNotificationPreferences: (enabled) => apiRequest(`${base}/notification-preferences`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  sessions: () => apiRequest(`${base}/sessions`),
  revokeSessions: (sessionIds) => apiRequest(`${base}/sessions/revoke`, { method: "POST", body: JSON.stringify({ sessionIds }) }),
  settings: () => apiRequest(`${base}/settings`),
  saveSettings: (payload) => apiRequest(`${base}/settings`, { method: "PUT", body: JSON.stringify(payload) }),
};



