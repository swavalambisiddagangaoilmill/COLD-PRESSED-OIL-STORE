// Admin API controller mapping service results to safe responses.
import * as admin from "../services/adminDataService.js";
import { hasPermission } from "../middleware/adminAuth.js";
import { writeAuditLog } from "../utils/audit.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { clearReadNotifications, createAdminNotification, deleteNotification, getNotificationPreferences, listAdminNotifications, markAllNotificationsRead, markNotification, saveNotificationPreferences } from "../../services/adminNotificationService.js";
import { listAdminSessions, revokeAdminSessions } from "../../services/adminSessionService.js";
import { addRestrictionNote, extendRestriction, getRestriction, listRestrictions, removeRestriction } from "../services/restrictionAdminService.js";
import { createManualAttentionWorkbook, listFulfillmentOrders, submitFulfillmentBatch } from "../../services/fulfillmentService.js";
import { getNavbarConfig, saveNavbarConfig } from "../../services/navigationService.js";

export const dashboard = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Dashboard fetched", await admin.dashboardData()));
export const navbar = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Navbar fetched", { navbar: await getNavbarConfig() }));
export const saveNavbar = asyncHandler(async (req, res) => { const navbar = await saveNavbarConfig(req.body, req.user._id); await writeAuditLog(req, { action: "navbar.update", resourceType: "SiteContent", resourceId: "navbar", summary: "Public navbar configuration updated" }); sendSuccess(res, 200, "Navbar saved", { navbar }); });
export const orders = asyncHandler(async (req, res) => sendSuccess(res, 200, "Orders fetched", await admin.listOrders(req.query)));
export const orderStatus = asyncHandler(async (req, res) => { const order = await admin.updateOrderStatus(req.params.id, req.body.status); await writeAuditLog(req, { action: "order.status", resourceType: "Order", resourceId: order._id, summary: `Order moved to ${order.orderStatus}` }); sendSuccess(res, 200, "Order updated", { order }); });
export const orderReadyToShip = asyncHandler(async (req, res) => { const order = await admin.readyToShip(req.params.id); await writeAuditLog(req, { action: "shipping.booked", resourceType: "Order", resourceId: order._id, summary: "Shiprocket shipment booked and AWB assigned" }); sendSuccess(res, 200, "Shipment booked", { order }); });
export const orderRequestPickup = asyncHandler(async (req, res) => { const order = await admin.requestPickup(req.params.id); await writeAuditLog(req, { action: "shipping.pickup_requested", resourceType: "Order", resourceId: order._id, summary: "Shiprocket pickup requested" }); sendSuccess(res, 200, "Pickup requested", { order }); });
export const orderCancelShipment = asyncHandler(async (req, res) => { const order = await admin.cancelShipment(req.params.id); await writeAuditLog(req, { action: "shipping.cancelled", resourceType: "Order", resourceId: order._id, summary: "Shiprocket shipment cancelled" }); sendSuccess(res, 200, "Shipment cancelled", { order }); });
export const orderGenerateLabel = asyncHandler(async (req, res) => { const order = await admin.generateLabel(req.params.id); await writeAuditLog(req, { action: "shipping.label_generated", resourceType: "Order", resourceId: order._id, summary: "Shipment label generated" }); sendSuccess(res, 200, "Shipment label ready", { order }); });
export const generateManifest = asyncHandler(async (req, res) => { const result = await admin.generateManifest(req.body.orderIds); await writeAuditLog(req, { action: "shipping.manifest_generated", resourceType: "Order", summary: `Manifest generated for ${result.orders.length} shipment(s)` }); sendSuccess(res, 200, "Shipment manifest ready", { orderIds: result.orders.map((order) => order._id), existing: result.existing }); });
export const printManifest = asyncHandler(async (req, res) => { const result = await admin.printManifest(req.body.orderIds); await writeAuditLog(req, { action: "shipping.manifest_printed", resourceType: "Order", summary: `Manifest prepared for ${result.orders.length} shipment(s)` }); sendSuccess(res, 200, "Printable manifest ready", { orderIds: result.orders.map((order) => order._id), existing: result.existing }); });
export const orderGenerateShipmentInvoice = asyncHandler(async (req, res) => { const order = await admin.generateShiprocketInvoice(req.params.id); await writeAuditLog(req, { action: "shipping.invoice_generated", resourceType: "Order", resourceId: order._id, summary: "Shiprocket operational invoice generated" }); sendSuccess(res, 200, "Shiprocket invoice ready", { order }); });
export const shipmentDocument = asyncHandler(async (req, res) => {
  const url = await admin.shipmentDocument(req.params.id, req.params.type);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Shipment document download failed.");
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("pdf")) throw new Error("Shiprocket returned an invalid document.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error("Shiprocket returned an invalid document.");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="shipment-${req.params.type}-${req.params.id}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(bytes);
});
export const fulfillmentOrders = asyncHandler(async (req, res) => sendSuccess(res, 200, "Fulfillment orders fetched", await listFulfillmentOrders(req.query)));
export const bulkReadyToShip = asyncHandler(async (req, res) => {
  const result = await submitFulfillmentBatch(req.body.orderIds);
  await Promise.allSettled(result.results.map((item) => writeAuditLog(req, { action: item.success ? "shipping.submission_succeeded" : "shipping.submission_failed", resourceType: "Order", resourceId: item.orderId, summary: item.success ? `Shipment submitted${item.order?.awbCode ? ` with AWB ${item.order.awbCode}` : ""}` : item.reason })));
  sendSuccess(res, 200, "Fulfillment batch processed", result);
});
export const fulfillmentExport = asyncHandler(async (_req, res) => {
  const buffer = await createManualAttentionWorkbook();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="shipment-attention-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(buffer));
});
export const orderHandover = asyncHandler(async (req, res) => { const order = await admin.handoverShipment(req.params.id); await writeAuditLog(req, { action: "order.handed_over", resourceType: "Order", resourceId: order._id, summary: "Order handed over to Shiprocket" }); sendSuccess(res, 200, "Shipment handed over", { order }); });
export const products = asyncHandler(async (req, res) => sendSuccess(res, 200, "Products fetched", await admin.listProducts(req.query)));
export const saveProduct = asyncHandler(async (req, res) => { const product = await admin.saveProduct(req.body, req.params.id); await writeAuditLog(req, { action: req.params.id ? "product.update" : "product.create", resourceType: "Product", resourceId: product._id, summary: `${product.title} saved` }); sendSuccess(res, req.params.id ? 200 : 201, "Product saved", { product }); });
export const archiveProduct = asyncHandler(async (req, res) => { const product = await admin.archiveProduct(req.params.id); await writeAuditLog(req, { action: "product.archive", resourceType: "Product", resourceId: product._id, summary: `${product.title} archived` }); sendSuccess(res, 200, "Product archived", { product }); });
export const bulkPricePreview = asyncHandler(async (req, res) => sendSuccess(res, 200, "Bulk preview generated", await admin.bulkPricePreview(req.body)));
export const bulkPriceApply = asyncHandler(async (req, res) => { const result = await admin.bulkPriceApply(req.body); await writeAuditLog(req, { action: "product.bulk_price", resourceType: "Product", summary: `${result.updated} products updated`, after: req.body }); sendSuccess(res, 200, "Bulk prices updated", result); });
export const inventoryUpdate = asyncHandler(async (req, res) => { const product = await admin.updateInventory(req.params.id, req.body); await writeAuditLog(req, { action: "inventory.update", resourceType: "Product", resourceId: product._id, summary: `${product.title}${req.body.variantId ? " variant" : ""} stock updated to litres` }); sendSuccess(res, 200, "Inventory updated", { product }); });
export const galleryImages = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Gallery fetched", { items: await admin.listGalleryImages() }));
export const saveGalleryImage = asyncHandler(async (req, res) => { const image = await admin.saveGalleryImage(req.body, req.params.id); await writeAuditLog(req, { action: req.params.id ? "gallery.update" : "gallery.create", resourceType: "GalleryImage", resourceId: image._id, summary: `${image.title || "Gallery image"} saved` }); sendSuccess(res, req.params.id ? 200 : 201, "Gallery image saved", { image }); });
export const deleteGalleryImage = asyncHandler(async (req, res) => { const image = await admin.deleteGalleryImage(req.params.id); await writeAuditLog(req, { action: "gallery.delete", resourceType: "GalleryImage", resourceId: req.params.id, summary: `${image.title || "Gallery image"} deleted` }); sendSuccess(res, 200, "Gallery image deleted", { image }); });
export const reorderGalleryImages = asyncHandler(async (req, res) => { const items = await admin.reorderGalleryImages(req.body.ids || []); await writeAuditLog(req, { action: "gallery.reorder", resourceType: "GalleryImage", summary: "Gallery images reordered" }); sendSuccess(res, 200, "Gallery reordered", { items }); });
export const categories = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Categories fetched", { items: await admin.listCategories() }));
export const saveCategory = asyncHandler(async (req, res) => { const category = await admin.saveCategory(req.body, req.params.id); await writeAuditLog(req, { action: "category.save", resourceType: "Category", resourceId: category._id, summary: `${category.name} saved` }); sendSuccess(res, 200, "Category saved", { category }); });
export const deleteCategory = asyncHandler(async (req, res) => { const category = await admin.removeCategory(req.params.id); await writeAuditLog(req, { action: "CATEGORY_DELETE", resourceType: "Category", resourceId: category._id, summary: `${category.name} deleted` }); sendSuccess(res, 200, "Category deleted successfully.", { category: { _id: category._id, name: category.name } }); });
export const offers = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Offers fetched", { items: await admin.listOffers() }));
export const createOffer = asyncHandler(async (req, res) => { const offer = await admin.saveOffer(req.body, req.user._id); await writeAuditLog(req, { action: "offer.create", resourceType: "Offer", resourceId: offer._id, summary: `${offer.name} created` }); await createAdminNotification({ category: "system", type: "offer_created", title: "Offer Created", description: `${offer.name} is now available to customers.`, related: { kind: "Offer", id: offer._id, label: offer.name, path: "/admin/offers" } }); sendSuccess(res, 201, "Offer created", { offer }); });
export const coupons = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Coupons fetched", { items: await admin.listCoupons() }));
export const createCoupon = asyncHandler(async (req, res) => { const coupon = await admin.saveCoupon(req.body, req.user._id); await writeAuditLog(req, { action: "coupon.create", resourceType: "Coupon", resourceId: coupon._id, summary: `${coupon.code} created` }); await createAdminNotification({ category: "system", type: "coupon_created", title: "Coupon Created", description: `${coupon.code} is ready for checkout.`, related: { kind: "Coupon", id: coupon._id, label: coupon.code, path: "/admin/coupons" } }); sendSuccess(res, 201, "Coupon created", { coupon }); });
export const shipping = asyncHandler(async (req, res) => sendSuccess(res, 200, "Shipping fetched", await admin.listOrders({ ...req.query, limit: 100 })));
export const customers = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Customers fetched", { items: await admin.listCustomers() }));
export const payments = asyncHandler(async (req, res) => sendSuccess(res, 200, "Payments fetched", { items: await admin.listPayments(req.query) }));
export const messages = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Messages fetched", { items: await admin.listMessages() }));
export const messageStatus = asyncHandler(async (req, res) => sendSuccess(res, 200, "Message updated", { message: await admin.updateMessage(req.params.id, req.body.status) }));
export const reports = asyncHandler(async (req, res) => sendSuccess(res, 200, "Report fetched", { items: await admin.reports(req.query.type) }));
export const adminUsers = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Admin users fetched", { items: await admin.listAdmins() }));
export const updateAdmin = asyncHandler(async (req, res) => { const user = await admin.updateAdminRole(req.params.id, req.body.adminRole); await writeAuditLog(req, { action: "admin.role", resourceType: "User", resourceId: user._id, summary: `${user.email} role updated` }); sendSuccess(res, 200, "Admin updated", { user }); });
export const auditLogs = asyncHandler(async (req, res) => sendSuccess(res, 200, "Audit logs fetched", { items: await admin.listAuditLogs(req.query) }));
export const settings = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Settings fetched", { settings: await admin.getSettings() }));
export const saveSettings = asyncHandler(async (req, res) => { const settings = await admin.updateSettings(req.body); await writeAuditLog(req, { action: "settings.update", resourceType: "StoreSettings", resourceId: "store", summary: "Store settings updated" }); sendSuccess(res, 200, "Settings saved", { settings }); });

export const updateOffer = asyncHandler(async (req, res) => {
  const offer = await admin.saveOffer(req.body, req.user._id, req.params.id);
  await writeAuditLog(req, { action: "offer.update", resourceType: "Offer", resourceId: offer._id, summary: `${offer.name} updated` });
  sendSuccess(res, 200, "Offer updated", { offer });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await admin.saveCoupon(req.body, req.user._id, req.params.id);
  await writeAuditLog(req, { action: "coupon.update", resourceType: "Coupon", resourceId: coupon._id, summary: `${coupon.code} updated` });
  sendSuccess(res, 200, "Coupon updated", { coupon });
});


export const deleteOffer = asyncHandler(async (req, res) => {
  const offer = await admin.deleteOffer(req.params.id);
  await writeAuditLog(req, { action: "offer.delete", resourceType: "Offer", resourceId: req.params.id, summary: `${offer?.name || "Offer"} deleted` });
  await createAdminNotification({ category: "system", type: "offer_deleted", title: "Offer Deleted", description: `${offer?.name || "An offer"} was removed from the storefront.`, related: { kind: "Offer", id: req.params.id, label: offer?.name, path: "/admin/offers" } });
  sendSuccess(res, 200, "Offer deleted", { offer });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await admin.deleteCoupon(req.params.id);
  await writeAuditLog(req, { action: "coupon.delete", resourceType: "Coupon", resourceId: req.params.id, summary: `${coupon?.code || "Coupon"} deleted` });
  await createAdminNotification({ category: "system", type: "coupon_deleted", title: "Coupon Deleted", description: `${coupon?.code || "A coupon"} was removed from checkout.`, related: { kind: "Coupon", id: req.params.id, label: coupon?.code, path: "/admin/coupons" } });
  sendSuccess(res, 200, "Coupon deleted", { coupon });
});
export const globalSearch = asyncHandler(async (req, res) => {
  const results = await admin.globalAdminSearch(req.query.q, req.user, hasPermission);
  sendSuccess(res, 200, "Search complete", results);
});

export const notifications = asyncHandler(async (req, res) => sendSuccess(res, 200, "Notifications fetched", await listAdminNotifications(req.user._id, req.query)));
export const notificationPreferences = asyncHandler(async (req, res) => sendSuccess(res, 200, "Notification preferences fetched", await getNotificationPreferences(req.user._id)));
export const saveNotificationPreferencesHandler = asyncHandler(async (req, res) => sendSuccess(res, 200, "Notification preferences saved", await saveNotificationPreferences(req.user._id, req.body.enabled || {})));
export const markNotificationRead = asyncHandler(async (req, res) => sendSuccess(res, 200, "Notification updated", { notification: await markNotification(req.user._id, req.params.id, req.body.read !== false) }));
export const removeNotification = asyncHandler(async (req, res) => sendSuccess(res, 200, "Notification deleted", { notification: await deleteNotification(req.user._id, req.params.id) }));
export const markNotificationsRead = asyncHandler(async (req, res) => { await markAllNotificationsRead(req.user._id); sendSuccess(res, 200, "Notifications marked read"); });
export const clearReadNotificationsHandler = asyncHandler(async (req, res) => { await clearReadNotifications(req.user._id); sendSuccess(res, 200, "Read notifications cleared"); });
export const sessions = asyncHandler(async (req, res) => sendSuccess(res, 200, "Admin sessions fetched", await listAdminSessions(req.user._id, req.authSessionId)));
export const revokeSessions = asyncHandler(async (req, res) => { const count = await revokeAdminSessions(req.user._id, req.body.sessionIds || [], "admin_panel"); sendSuccess(res, 200, "Admin sessions revoked", { count }); });
export const restrictions = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, "Restrictions fetched", await listRestrictions(req.query));
});

export const restrictionDetails = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, "Restriction fetched", { restriction: await getRestriction(req.params.id) });
});

export const removeRestrictionHandler = asyncHandler(async (req, res) => {
  const restriction = await removeRestriction(req.params.id, req.user, req.body.reason);
  await writeAuditLog(req, { action: "restriction.remove", resourceType: "Restriction", resourceId: req.params.id, summary: `Restriction removed by ${req.user.email}`, after: { reason: req.body.reason } });
  sendSuccess(res, 200, "Restriction removed", { restriction });
});

export const extendRestrictionHandler = asyncHandler(async (req, res) => {
  const restriction = await extendRestriction(req.params.id, req.user, req.body.expiresAt, req.body.reason);
  await writeAuditLog(req, { action: "restriction.extend", resourceType: "Restriction", resourceId: req.params.id, summary: `Restriction extended by ${req.user.email}`, after: { expiresAt: req.body.expiresAt, reason: req.body.reason } });
  sendSuccess(res, 200, "Restriction extended", { restriction });
});

export const addRestrictionNoteHandler = asyncHandler(async (req, res) => {
  const restriction = await addRestrictionNote(req.params.id, req.user, req.body.note);
  await writeAuditLog(req, { action: "restriction.note", resourceType: "Restriction", resourceId: req.params.id, summary: `Restriction note added by ${req.user.email}`, after: { reason: req.body.note } });
  sendSuccess(res, 200, "Restriction note saved", { restriction });
});



