// Adds admin-only service and action context without changing storefront errors.
import { apiRequest } from "../../api/apiClient.js";

function contextFor(endpoint, method = "GET") {
  const path = String(endpoint).split("?")[0];
  const verb = String(method).toUpperCase();
  if (path.includes("admin-auth")) return ["Authentication Service", "authenticate the admin"];
  if (path.includes("service-status")) return ["Service Status Service", "check external service availability"];
  if (path.includes("audit-logs")) return ["Audit Service", "load admin audit logs"];
  if (path.includes("/search")) return ["Admin Search Service", "search admin records"];
  if (path.includes("sessions")) return ["Session Service", "manage admin sessions"];
  if (path.includes("ready-to-ship")) return ["Shipping Service", "prepare the order for shipping"];
  if (path.includes("handover") || path.includes("mock-shipment") || path.includes("shipping")) return ["Shipping Service", "update shipment status"];
  if (path.includes("orders/") && path.includes("status")) return ["Order Service", "update order status"];
  if (path.includes("orders")) return ["Order Service", verb === "GET" ? "load orders" : "process the order"];
  if (path.includes("inventory")) return ["Inventory Service", "update variant stock"];
  if (path.includes("products")) return ["Product Service", verb === "POST" ? "create the product" : verb === "PUT" ? "update the product and its variants" : verb === "DELETE" ? "archive the product" : "load products"];
  if (path.includes("upload") || path.includes("gallery") || path.includes("carousel")) return ["Image Storage Service", verb === "GET" ? "load images" : "update stored images"];
  if (path.includes("payments")) return ["Payment Service", "load payment information"];
  if (path.includes("coupons")) return ["Coupon Service", `${verb === "DELETE" ? "delete" : verb === "GET" ? "load" : "save"} the coupon`];
  if (path.includes("offers")) return ["Offer Service", `${verb === "DELETE" ? "delete" : verb === "GET" ? "load" : "save"} the offer`];
  if (path.includes("notification")) return ["Notification Service", verb === "GET" ? "load admin notifications" : "update admin notifications"];
  if (path.includes("messages")) return ["Message Service", verb === "GET" ? "load customer messages" : "update the customer message"];
  if (path.includes("reports") || path.includes("dashboard")) return ["Analytics Service", "load admin analytics"];
  if (path.includes("settings")) return ["Settings Service", verb === "GET" ? "load store settings" : "save store settings"];
  if (path.includes("restrictions")) return ["Security Service", "manage access restrictions"];
  if (path.includes("users") || path.includes("customers")) return ["User Service", "manage user records"];
  return ["Admin Service", "complete the requested admin action"];
}

function sentence(value) {
  const text = String(value || "").trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "The operation failed.";
}

export function decorateAdminError(error, endpoint, options = {}) {
  const backend = error.payload?.error;
  const [fallbackService, fallbackAction] = contextFor(endpoint, options.method);
  const service = backend?.service || (error.status === 401 ? "Authentication Service" : error.status === 403 ? "Authorization Service" : error.status === 429 ? "Rate Limit Service" : fallbackService);
  const action = backend?.action || fallbackAction;
  const rawDetail = backend?.message || (error.status === 0 ? `Unable to ${action} because the server could not be reached.` : error.message);
  const generic = rawDetail === "Service is temporarily unavailable. Please try again shortly.";
  const detail = generic ? `Unable to ${action}.` : rawDetail;
  error.service = service;
  error.action = action;
  error.code = backend?.code || error.errors?.[0]?.code || "ADMIN_REQUEST_FAILED";
  error.detail = sentence(detail);
  error.requestId = backend?.requestId;
  const actionMessage = sentence(`Unable to ${action}.`);
  const includesAction = error.detail.toLowerCase().includes(action.toLowerCase());
  error.message = `${service} Error: ${includesAction ? error.detail : `${actionMessage} ${error.detail}`}`;
  return error;
}

export async function adminRequest(endpoint, options = {}) {
  try {
    return await apiRequest(endpoint, options);
  } catch (error) {
    throw decorateAdminError(error, endpoint, options);
  }
}
