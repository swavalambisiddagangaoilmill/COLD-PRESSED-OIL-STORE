// Admin API controller mapping service results to safe responses.
import * as admin from "../services/adminDataService.js";
import { hasPermission } from "../middleware/adminAuth.js";
import { writeAuditLog } from "../utils/audit.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { clearReadNotifications, createAdminNotification, deleteNotification, getNotificationPreferences, listAdminNotifications, markAllNotificationsRead, markNotification, saveNotificationPreferences } from "../../services/adminNotificationService.js";
import { listAdminSessions, revokeAdminSessions } from "../../services/adminSessionService.js";
import { addRestrictionNote, extendRestriction, getRestriction, listRestrictions, removeRestriction } from "../services/restrictionAdminService.js";
import { createCampaign, getCampaign, listCampaigns, listEligibleCustomers, listMarketingTemplates, marketingOverview, previewAudience, previewTemplate, sendTestMarketingMessage } from "../../services/whatsappMarketingService.js";

export const dashboard = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Dashboard fetched", await admin.dashboardData()));
export const orders = asyncHandler(async (req, res) => sendSuccess(res, 200, "Orders fetched", await admin.listOrders(req.query)));
export const orderStatus = asyncHandler(async (req, res) => { const order = await admin.updateOrderStatus(req.params.id, req.body.status); await writeAuditLog(req, { action: "order.status", resourceType: "Order", resourceId: order._id, summary: `Order moved to ${order.orderStatus}` }); sendSuccess(res, 200, "Order updated", { order }); });
export const orderReadyToShip = asyncHandler(async (req, res) => { const order = await admin.readyToShip(req.params.id); await writeAuditLog(req, { action: "order.ready_to_ship", resourceType: "Order", resourceId: order._id, summary: "Order marked ready to ship" }); sendSuccess(res, 200, "Ready to ship", { order }); });
export const orderHandover = asyncHandler(async (req, res) => { const order = await admin.handoverShipment(req.params.id); await writeAuditLog(req, { action: "order.handed_over", resourceType: "Order", resourceId: order._id, summary: "Order handed over to Shiprocket" }); sendSuccess(res, 200, "Shipment handed over", { order }); });
export const mockShippingNext = asyncHandler(async (req, res) => { const order = await admin.nextMockShipping(req.params.id); await writeAuditLog(req, { action: "shipping.mock_next", resourceType: "Order", resourceId: order._id, summary: `Mock shipment moved to ${order.shippingStatus}` }); sendSuccess(res, 200, "Mock shipment advanced", { order }); });
export const products = asyncHandler(async (req, res) => sendSuccess(res, 200, "Products fetched", await admin.listProducts(req.query)));
export const saveProduct = asyncHandler(async (req, res) => { const product = await admin.saveProduct(req.body, req.params.id); await writeAuditLog(req, { action: req.params.id ? "product.update" : "product.create", resourceType: "Product", resourceId: product._id, summary: `${product.title} saved` }); sendSuccess(res, req.params.id ? 200 : 201, "Product saved", { product }); });
export const archiveProduct = asyncHandler(async (req, res) => { const product = await admin.archiveProduct(req.params.id); await writeAuditLog(req, { action: "product.archive", resourceType: "Product", resourceId: product._id, summary: `${product.title} archived` }); sendSuccess(res, 200, "Product archived", { product }); });
export const bulkPricePreview = asyncHandler(async (req, res) => sendSuccess(res, 200, "Bulk preview generated", await admin.bulkPricePreview(req.body)));
export const bulkPriceApply = asyncHandler(async (req, res) => { const result = await admin.bulkPriceApply(req.body); await writeAuditLog(req, { action: "product.bulk_price", resourceType: "Product", summary: `${result.updated} products updated`, after: req.body }); sendSuccess(res, 200, "Bulk prices updated", result); });
export const inventoryUpdate = asyncHandler(async (req, res) => { const product = await admin.updateInventory(req.params.id, req.body); const variant = product.variants.id(req.body.variantId) || product.variants.find((item) => item.isActive && !item.isArchived); await writeAuditLog(req, { action: "inventory.update", resourceType: "Product", resourceId: product._id, summary: `${product.title} ${variant?.name || "variant"} stock is ${variant?.stock ?? "unknown"}` }); sendSuccess(res, 200, "Inventory updated", { product }); });
export const galleryImages = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Gallery fetched", { items: await admin.listGalleryImages() }));
export const saveGalleryImage = asyncHandler(async (req, res) => { const image = await admin.saveGalleryImage(req.body, req.params.id); await writeAuditLog(req, { action: req.params.id ? "gallery.update" : "gallery.create", resourceType: "GalleryImage", resourceId: image._id, summary: `${image.title || "Gallery image"} saved` }); sendSuccess(res, req.params.id ? 200 : 201, "Gallery image saved", { image }); });
export const deleteGalleryImage = asyncHandler(async (req, res) => { const image = await admin.deleteGalleryImage(req.params.id); await writeAuditLog(req, { action: "gallery.delete", resourceType: "GalleryImage", resourceId: req.params.id, summary: `${image.title || "Gallery image"} deleted` }); sendSuccess(res, 200, "Gallery image deleted", { image }); });
export const reorderGalleryImages = asyncHandler(async (req, res) => { const items = await admin.reorderGalleryImages(req.body.ids || []); await writeAuditLog(req, { action: "gallery.reorder", resourceType: "GalleryImage", summary: "Gallery images reordered" }); sendSuccess(res, 200, "Gallery reordered", { items }); });
export const categories = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Categories fetched", { items: await admin.listCategories() }));
export const saveCategory = asyncHandler(async (req, res) => { const category = await admin.saveCategory(req.body, req.params.id); await writeAuditLog(req, { action: "category.save", resourceType: "Category", resourceId: category._id, summary: `${category.name} saved` }); sendSuccess(res, 200, "Category saved", { category }); });
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

export const whatsappOverview = asyncHandler(async (_req, res) => sendSuccess(res, 200, "WhatsApp overview fetched", await marketingOverview()));
export const whatsappTemplates = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Approved WhatsApp templates fetched", { items: listMarketingTemplates() }));
export const whatsappCustomers = asyncHandler(async (req, res) => sendSuccess(res, 200, "Eligible customers fetched", { items: await listEligibleCustomers(req.query.q) }));
export const whatsappAudiencePreview = asyncHandler(async (req, res) => sendSuccess(res, 200, "Audience calculated", await previewAudience(req.body)));
export const whatsappTemplatePreview = asyncHandler(async (req, res) => sendSuccess(res, 200, "Message preview generated", previewTemplate(req.body.templateId, req.body.variables)));
export const whatsappTest = asyncHandler(async (req, res) => { const result = await sendTestMarketingMessage(req.body.templateId, req.body.variables); await writeAuditLog(req, { action: "whatsapp.test", resourceType: "WhatsAppCampaign", summary: `Approved template ${req.body.templateId} test sent` }); sendSuccess(res, 200, "Test message sent", result); });
export const whatsappCreateCampaign = asyncHandler(async (req, res) => { const result = await createCampaign(req.user._id, req.body, req.get("X-Idempotency-Key")); if (!result.duplicate) await writeAuditLog(req, { action: "whatsapp.campaign.create", resourceType: "WhatsAppCampaign", resourceId: result.campaign.id, summary: `Campaign queued for ${result.campaign.recipientCount} opted-in recipients`, after: { templateId: result.campaign.templateId, audience: result.campaign.audience, recipientCount: result.campaign.recipientCount, status: result.campaign.status } }); sendSuccess(res, result.duplicate ? 200 : 202, result.duplicate ? "Campaign request already accepted" : "Campaign queued", result); });
export const whatsappCampaigns = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Campaign history fetched", { items: await listCampaigns() }));
export const whatsappCampaign = asyncHandler(async (req, res) => sendSuccess(res, 200, "Campaign fetched", { campaign: await getCampaign(req.params.id) }));

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
export const revokeSessions = asyncHandler(async (req, res) => { const requested = req.body.sessionIds || []; const sessionIds = requested.filter((id) => id !== req.authSessionId); const count = sessionIds.length ? await revokeAdminSessions(req.user._id, sessionIds, "admin_panel") : 0; sendSuccess(res, 200, "Admin sessions revoked", { count }); });
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



