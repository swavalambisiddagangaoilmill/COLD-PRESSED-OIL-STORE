// Admin authorization middleware and permission map.
import { ApiError } from "../../utils/ApiError.js";

export const ADMIN_ROLES = ["OWNER", "ORDER_MANAGER", "PRODUCT_MANAGER", "CONTENT_MANAGER"];

const rolePermissions = {
  OWNER: ["*"],
  ORDER_MANAGER: ["dashboard.read", "notifications.read", "sessions.read", "orders.read", "orders.update", "orders.ship", "shipping.read", "shipping.manage", "customers.read", "payments.read", "reports.read"],
  PRODUCT_MANAGER: ["dashboard.read", "notifications.read", "sessions.read", "products.read", "products.create", "products.update", "products.archive", "inventory.read", "inventory.update", "categories.read", "categories.manage", "reports.read"],
  CONTENT_MANAGER: ["dashboard.read", "notifications.read", "sessions.read", "messages.read", "messages.manage", "gallery.read", "gallery.manage"],
};

export function getAdminRole(user) {
  if (!user || user.role !== "admin") return null;
  return user.adminRole || "OWNER";
}

export function hasPermission(user, permission) {
  const role = getAdminRole(user);
  if (!role) return false;
  const permissions = rolePermissions[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requireAdmin(req, _res, next) {
  if (!getAdminRole(req.user) || req.user.isDisabled) return next(new ApiError("Admin access required.", 403));
  return next();
}

export function requireAdminPermission(permission) {
  return (req, _res, next) => {
    if (!hasPermission(req.user, permission)) return next(new ApiError("You do not have permission to perform this admin action.", 403));
    return next();
  };
}



