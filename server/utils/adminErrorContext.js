// Maps admin API routes to safe service/action metadata for structured failures.
export function getAdminErrorContext(req) {
  const path = String(req.originalUrl || req.baseUrl || req.path || "").split("?")[0];
  const method = String(req.method || "GET").toUpperCase();
  if (path.includes("/admin-auth")) return { service: "Authentication Service", action: "authenticate the admin", code: "ADMIN_AUTH_FAILED" };
  if (path.includes("/service-status")) return { service: "Service Status Service", action: "check external service availability", code: "SERVICE_STATUS_CHECK_FAILED" };
  if (path.includes("/audit-logs")) return { service: "Audit Service", action: "load admin audit logs", code: "AUDIT_LOG_OPERATION_FAILED" };
  if (path.includes("/search")) return { service: "Admin Search Service", action: "search admin records", code: "ADMIN_SEARCH_FAILED" };
  if (path.includes("/sessions")) return { service: "Session Service", action: "manage admin sessions", code: "ADMIN_SESSION_OPERATION_FAILED" };
  if (path.includes("/ready-to-ship")) return { service: "Shipping Service", action: "prepare the order for shipping", code: "READY_TO_SHIP_FAILED" };
  if (path.includes("/handover") || path.includes("mock-shipment") || path.includes("/shipping")) return { service: "Shipping Service", action: "update shipment status", code: "SHIPPING_OPERATION_FAILED" };
  if (path.includes("/orders/") && path.includes("/status")) return { service: "Order Service", action: "update order status", code: "ORDER_STATUS_UPDATE_FAILED" };
  if (path.includes("/orders")) return { service: "Order Service", action: method === "GET" ? "load orders" : "process the order", code: "ORDER_OPERATION_FAILED" };
  if (path.includes("/inventory")) return { service: "Inventory Service", action: "update variant stock", code: "INVENTORY_UPDATE_FAILED" };
  if (path.includes("/products")) return { service: "Product Service", action: method === "POST" ? "create the product" : method === "PUT" ? "update the product and its variants" : method === "DELETE" ? "archive the product" : "load products", code: "PRODUCT_OPERATION_FAILED" };
  if (path.includes("/upload") || path.includes("/gallery") || path.includes("/carousel")) return { service: "Image Storage Service", action: method === "GET" ? "load images" : "update stored images", code: "IMAGE_STORAGE_OPERATION_FAILED" };
  if (path.includes("/payments")) return { service: "Payment Service", action: "load payment information", code: "PAYMENT_OPERATION_FAILED" };
  if (path.includes("/coupons")) return { service: "Coupon Service", action: `${method === "DELETE" ? "delete" : method === "GET" ? "load" : "save"} the coupon`, code: "COUPON_OPERATION_FAILED" };
  if (path.includes("/offers")) return { service: "Offer Service", action: `${method === "DELETE" ? "delete" : method === "GET" ? "load" : "save"} the offer`, code: "OFFER_OPERATION_FAILED" };
  if (path.includes("/notification")) return { service: "Notification Service", action: method === "GET" ? "load admin notifications" : "update admin notifications", code: "NOTIFICATION_OPERATION_FAILED" };
  if (path.includes("/messages")) return { service: "Message Service", action: method === "GET" ? "load customer messages" : "update the customer message", code: "MESSAGE_OPERATION_FAILED" };
  if (path.includes("/reports") || path.includes("/dashboard")) return { service: "Analytics Service", action: "load admin analytics", code: "ANALYTICS_OPERATION_FAILED" };
  if (path.includes("/settings")) return { service: "Settings Service", action: method === "GET" ? "load store settings" : "save store settings", code: "SETTINGS_OPERATION_FAILED" };
  if (path.includes("/restrictions")) return { service: "Security Service", action: "manage access restrictions", code: "SECURITY_OPERATION_FAILED" };
  if (path.includes("/users") || path.includes("/customers")) return { service: "User Service", action: "manage user records", code: "USER_OPERATION_FAILED" };
  return { service: "Admin Service", action: "complete the requested admin action", code: "ADMIN_OPERATION_FAILED" };
}

export function isAdminApiRequest(req) {
  return /^\/api\/(admin-panel|admin(?:\/|$)|admin-auth|upload(?:\/|$))/.test(String(req.originalUrl || ""));
}

export function isDatabaseError(error) {
  return /Mongo|Mongoose|Topology|ServerSelection/i.test(String(error?.name || "")) || [11000, 11600, 11602, 13435, 13436].includes(Number(error?.code));
}

export function sanitizeAdminLogMessage(value) {
  return String(value || "")
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[database connection redacted]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(password|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
}
