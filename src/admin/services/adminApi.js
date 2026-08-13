// Admin API service layer using the existing shared API client.
import { apiRequest } from "../../api/apiClient.js";

const base = "/admin-panel";
const promotionChanged = (request) => request.then((result) => { window.dispatchEvent(new Event("ss-oil-mill-promotions-changed")); return result; });

export const adminApi = {
  search: (q) => apiRequest(`${base}/search?q=${encodeURIComponent(q)}`),
  dashboard: () => apiRequest(`${base}/dashboard`),
  serviceStatus: () => apiRequest("/service-status"),
  orders: (query = "") => apiRequest(`${base}/orders${query}`),
  orderStatus: (id, status) => apiRequest(`${base}/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  readyToShip: (id) => apiRequest(`${base}/orders/${id}/ready-to-ship`, { method: "POST" }),
  handoverShipment: (id) => apiRequest(`${base}/orders/${id}/handover`, { method: "POST" }),
  mockNext: (id) => apiRequest(`${base}/orders/${id}/mock-shipment/next`, { method: "POST" }),
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
  createCarousel: (file) => {
    const form = new FormData();
    form.append("image", file);
    return promotionChanged(apiRequest("/admin/carousel", { method: "POST", body: form }));
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



