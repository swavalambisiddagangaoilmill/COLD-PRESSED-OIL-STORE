// Admin notification service with preferences, read states, and dedupe.
import AdminNotification from "../models/AdminNotification.js";
import AdminNotificationPreference from "../models/AdminNotificationPreference.js";
import Product from "../models/Product.js";
import StoreSettings from "../models/StoreSettings.js";
import User from "../models/User.js";

export const notificationTypes = {
  orders: ["new_order", "order_cancelled", "order_returned", "refund_requested", "order_delivered"],
  payments: ["payment_successful", "payment_failed", "payment_refunded"],
  inventory: ["low_stock", "out_of_stock", "back_in_stock"],
  customers: ["new_user_registration", "contact_form_submission", "newsletter_subscription"],
  security: ["failed_admin_login", "multiple_failed_login_attempts", "password_changed", "suspicious_activity", "admin_login", "admin_logout", "admin_session_revoked"],
  system: ["email_delivery_failed", "shipping_api_error", "backup_failed", "critical_server_error", "offer_created", "offer_updated", "offer_deleted", "coupon_created", "coupon_updated", "coupon_deleted"],
};

export function allNotificationTypes() {
  return Object.entries(notificationTypes).flatMap(([category, types]) => types.map((type) => ({ category, type })));
}

async function enabledForAnyAdmin(type) {
  const admins = await User.find({ role: "admin", isDisabled: { $ne: true } }).select("_id").lean();
  if (!admins.length) return false;
  const prefs = await AdminNotificationPreference.find({ admin: { $in: admins.map((admin) => admin._id) }, disabledTypes: type }).select("admin").lean();
  return prefs.length < admins.length;
}

export async function createAdminNotification(payload) {
  if (!(await enabledForAnyAdmin(payload.type))) return null;
  const update = { $setOnInsert: { ...payload, readBy: [], deletedBy: [] } };
  if (payload.dedupeKey) {
    return AdminNotification.findOneAndUpdate({ dedupeKey: payload.dedupeKey, resolvedAt: null }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  return AdminNotification.create(payload);
}

export async function createInventoryNotifications(product) {
  const settings = await StoreSettings.findOne({ key: "store" }).lean();
  const threshold = settings?.lowStockThreshold ?? 10;
  const variants = (product.variants || []).filter((variant) => variant.isActive && !variant.isArchived);
  const out = variants.find((variant) => variant.stock === 0);
  if (out) {
    return createAdminNotification({ category: "inventory", type: "out_of_stock", title: "Variant Out Of Stock", description: `${product.title} ${out.name} is out of stock.`, dedupeKey: `inventory:out:${product._id}:${out._id}`, related: { kind: "Product", id: product._id, label: product.title, path: "/admin/inventory" } });
  }
  const low = variants.find((variant) => variant.stock <= threshold);
  if (low) {
    return createAdminNotification({ category: "inventory", type: "low_stock", title: "Variant Low On Stock", description: `${product.title} ${low.name} has ${low.stock} units remaining.`, dedupeKey: `inventory:low:${product._id}:${low._id}`, related: { kind: "Product", id: product._id, label: product.title, path: "/admin/inventory" } });
  }
  await AdminNotification.updateMany({ dedupeKey: { $in: [`inventory:out:${product._id}`, `inventory:low:${product._id}`] }, resolvedAt: null }, { resolvedAt: new Date() });
  return createAdminNotification({ category: "inventory", type: "back_in_stock", title: "Product Back In Stock", description: `${product.title} is back in stock.`, dedupeKey: `inventory:back:${product._id}:${Date.now()}`, related: { kind: "Product", id: product._id, label: product.title, path: "/admin/inventory" } });
}

export async function listAdminNotifications(adminId, query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = { deletedBy: { $ne: adminId } };
  if (query.category) filter.category = query.category;
  if (query.unread === "true") filter.readBy = { $ne: adminId };
  const [items, total, unread] = await Promise.all([
    AdminNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AdminNotification.countDocuments(filter),
    AdminNotification.countDocuments({ deletedBy: { $ne: adminId }, readBy: { $ne: adminId } }),
  ]);
  return { items: items.map((item) => ({ ...item, read: item.readBy?.some((id) => id.toString() === adminId.toString()) })), unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function markNotification(adminId, id, read = true) {
  return AdminNotification.findByIdAndUpdate(id, read ? { $addToSet: { readBy: adminId } } : { $pull: { readBy: adminId } }, { new: true });
}

export async function deleteNotification(adminId, id) {
  return AdminNotification.findByIdAndUpdate(id, { $addToSet: { deletedBy: adminId } }, { new: true });
}

export async function markAllNotificationsRead(adminId) {
  await AdminNotification.updateMany({ readBy: { $ne: adminId }, deletedBy: { $ne: adminId } }, { $addToSet: { readBy: adminId } });
  return true;
}

export async function clearReadNotifications(adminId) {
  await AdminNotification.updateMany({ readBy: adminId }, { $addToSet: { deletedBy: adminId } });
  return true;
}

export async function getNotificationPreferences(adminId) {
  const prefs = await AdminNotificationPreference.findOneAndUpdate({ admin: adminId }, { $setOnInsert: { admin: adminId, disabledTypes: [] } }, { upsert: true, new: true });
  return { types: allNotificationTypes().map((item) => ({ ...item, enabled: !prefs.disabledTypes.includes(item.type) })) };
}

export async function saveNotificationPreferences(adminId, enabledMap = {}) {
  const disabledTypes = allNotificationTypes().filter((item) => enabledMap[item.type] === false).map((item) => item.type);
  await AdminNotificationPreference.findOneAndUpdate({ admin: adminId }, { admin: adminId, disabledTypes }, { upsert: true, new: true });
  return getNotificationPreferences(adminId);
}

