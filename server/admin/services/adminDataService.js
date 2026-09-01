// Admin data services backed by existing Swavalambi Siddaganga Oil Mill models.
import AdminAuditLog from "../../models/AdminAuditLog.js";
import Category from "../../models/Category.js";
import ContactMessage from "../../models/ContactMessage.js";
import GalleryImage from "../../models/GalleryImage.js";
import Coupon from "../../models/Coupon.js";
import Offer from "../../models/Offer.js";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import StoreSettings from "../../models/StoreSettings.js";
import User from "../../models/User.js";
import { createReadyToShipShipment, advanceMockShipment, markShipmentHandedOver } from "../../services/shiprocketService.js";
import { createAdminNotification, createInventoryNotifications } from "../../services/adminNotificationService.js";
import { normalizeCouponCode } from "../../services/couponService.js";
import { createProduct, updateProduct } from "../../services/productService.js";
import { deleteImage } from "../../services/uploadService.js";
import { ApiError } from "../../utils/ApiError.js";
import { slugify } from "../../utils/slugify.js";
import { assertOrderStatusTransition } from "../../services/orderStatusPolicy.js";

export async function getSettings() {
  return StoreSettings.findOneAndUpdate({ key: "store" }, { $setOnInsert: { key: "store" } }, { upsert: true, new: true });
}

export async function updateSettings(payload) {
  const allowed = ["storeName", "currency", "supportEmail", "supportPhone", "whatsappNumber", "minimumOrderAmount", "orderPrefix", "lowStockThreshold", "allowOutOfStockVisibility", "preventOutOfStockCheckout", "freeDeliveryThreshold", "defaultPackagingWeight", "defaultPackageLength", "defaultPackageWidth", "defaultPackageHeight", "codEnabled", "onlinePaymentEnabled", "maintenanceMode", "announcementBarEnabled", "customerRegistrationEnabled", "newsletterEnabled", "factoryAddress", "businessHours", "googleMapsLink"];
  const updates = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)));
  return StoreSettings.findOneAndUpdate({ key: "store" }, updates, { upsert: true, new: true, runValidators: true });
}

export async function dashboardData() {
  const settings = await getSettings();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const validRevenue = { createdAt: { $gte: start, $lt: end }, $or: [{ paymentStatus: "paid" }, { paymentMethod: "cod", orderStatus: { $ne: "cancelled" } }] };
  const [todayOrders, revenueAgg, pendingOrders, readyToShip, lowStock, totalCustomers, totalOrders, products, totalRevenueAgg, failedPayments, sales] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    Order.aggregate([{ $match: validRevenue }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
    Order.countDocuments({ orderStatus: "placed" }),
    Order.countDocuments({ shippingStatus: { $in: ["ready_for_pickup", "awb_assigned", "pickup_generated"] } }),
    Product.countDocuments({ variants: { $elemMatch: { stock: { $lte: settings.lowStockThreshold }, isActive: true, isArchived: { $ne: true } } }, isArchived: { $ne: true } }),
    User.countDocuments({ role: "user" }),
    Order.countDocuments(),
    Product.countDocuments({ isArchived: { $ne: true } }),
    Order.aggregate([{ $match: { $or: [{ paymentStatus: "paid" }, { paymentMethod: "cod", orderStatus: { $ne: "cancelled" } }] } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
    Order.countDocuments({ paymentStatus: "failed" }),
    Order.aggregate([{ $match: { createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }, paymentStatus: { $in: ["paid"] } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$totalAmount" }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  return { summary: { todayOrders, todayRevenue: revenueAgg[0]?.total || 0, pendingOrders, readyToShip, lowStock, totalCustomers, totalOrders, products, totalRevenue: totalRevenueAgg[0]?.total || 0 }, needsAttention: { waitingConfirmation: pendingOrders, readyToShip, lowStock, failedPayments }, sales };
}

export async function listOrders(query) {
  const page = Number(query.page) || 1; const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = {};
  if (query.status) filter.orderStatus = query.status;
  if (query.payment) filter.paymentStatus = query.payment;
  if (query.shippingStatus) filter.shippingStatus = query.shippingStatus;
  if (query.search) filter.$or = [{ _id: query.search.match(/^[a-f\d]{24}$/i) ? query.search : undefined }, { "shippingAddress.fullName": new RegExp(query.search, "i") }].filter((item) => Object.values(item)[0]);
  const [items, total] = await Promise.all([Order.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Order.countDocuments(filter)]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function updateOrderStatus(id, nextStatus) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError("Order not found.", 404);
  assertOrderStatusTransition(order.orderStatus, nextStatus);
  const previousStatus = order.orderStatus;
  const previousShippingStatus = order.shippingStatus;
  order.orderStatus = nextStatus;
  if (nextStatus === "cancelled") order.shippingStatus = "cancelled";
  if (nextStatus === "shipped" && !["picked_up", "in_transit", "out_for_delivery"].includes(order.shippingStatus)) order.shippingStatus = "shipped";
  if (nextStatus === "delivered") order.shippingStatus = "delivered";
  await order.save();
  if (nextStatus === "cancelled" && !order.inventoryRestoredAt) {
    try {
      await Product.bulkWrite(order.products.map((item) => ({ updateOne: { filter: { _id: item.product, "variants._id": item.variant }, update: { $inc: { "variants.$.stock": item.quantity } } } })));
      order.inventoryRestoredAt = new Date();
      await order.save();
    } catch (error) {
      order.orderStatus = previousStatus;
      order.shippingStatus = previousShippingStatus;
      await order.save().catch(() => undefined);
      const failure = new ApiError("Unable to restore variant stock, so the order cancellation was rolled back.", 500);
      failure.adminService = "Inventory Service";
      failure.adminAction = "restore variant stock while cancelling the order";
      failure.serviceCode = "INVENTORY_RESTORE_FAILED";
      failure.cause = error;
      throw failure;
    }
    const restoredProducts = await Product.find({ _id: { $in: order.products.map((item) => item.product) } });
    await Promise.allSettled(restoredProducts.map((product) => createInventoryNotifications(product)));
  }
  return order;
}

export async function readyToShip(id) { return createReadyToShipShipment(id); }
export async function handoverShipment(id) { return markShipmentHandedOver(id); }
export async function nextMockShipping(id) { return advanceMockShipment(id); }

export async function listProducts(query) {
  const page = Number(query.page) || 1; const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { isArchived: { $ne: true } };
  if (query.active) filter.isActive = query.active === "true";
  if (query.featured) filter.featured = query.featured === "true";
  if (query.stock === "low") filter.variants = { $elemMatch: { stock: { $gt: 0, $lte: 10 }, isActive: true, isArchived: { $ne: true } } };
  if (query.stock === "out") filter.variants = { $elemMatch: { stock: 0, isActive: true, isArchived: { $ne: true } } };
  if (query.search) filter.$text = { $search: query.search };
  const [items, total] = await Promise.all([Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Product.countDocuments(filter)]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function saveProduct(payload, id) {
  const allowed = ["title", "description", "benefits", "variants", "featured", "bestSeller", "newArrival", "codEnabled", "onlinePaymentEnabled", "returnEligible", "exchangeEligible", "isActive"];
  const data = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)));
  return id ? updateProduct(id, data) : createProduct(data);
}

export async function archiveProduct(id) {
  const product = await Product.findByIdAndUpdate(id, { isArchived: true, isActive: false }, { new: true });
  if (!product) throw new ApiError("Product not found.", 404);
  return product;
}

function buildBulkFilter(target) {
  const filter = { isArchived: { $ne: true } };
  if (target.productIds?.length) filter._id = { $in: target.productIds };
  if (target.featured !== undefined) filter.featured = Boolean(target.featured);
  if (target.active !== undefined) filter.isActive = Boolean(target.active);
  if (target.stockStatus === "low") filter.variants = { $elemMatch: { stock: { $gt: 0, $lte: 10 }, isActive: true, isArchived: { $ne: true } } };
  if (target.stockStatus === "out") filter.variants = { $elemMatch: { stock: 0, isActive: true, isArchived: { $ne: true } } };
  return filter;
}

function calculatePrice(variant, operation, value) {
  const amount = Number(value) || 0;
  if (operation === "increase_percentage") return Math.round(variant.price * (1 + amount / 100));
  if (operation === "decrease_percentage") return Math.max(0.01, Math.round(variant.price * (1 - amount / 100)));
  if (operation === "increase_fixed") return Math.round(variant.price + amount);
  if (operation === "decrease_fixed") return Math.max(0.01, Math.round(variant.price - amount));
  return variant.price;
}

export async function bulkPricePreview(payload) {
  const products = await Product.find(buildBulkFilter(payload.target || {})).limit(20);
  return { count: products.length, examples: products.slice(0, 5).map((product) => { const variant = product.variants.find((item) => item.isActive && !item.isArchived); return { id: product._id, title: `${product.title} · ${variant?.name || "-"}`, before: variant?.price || 0, after: variant ? calculatePrice(variant, payload.operation, payload.value) : 0 }; }) };
}

export async function bulkPriceApply(payload) {
  const products = await Product.find(buildBulkFilter(payload.target || {}));
  await Promise.all(products.map((product) => {
    const value = Number(payload.value) || 0;
    const variants = product.variants.filter((variant) => variant.isActive && !variant.isArchived);
    if (payload.operation === "set_exact_price") variants.forEach((variant) => { variant.price = Math.max(0.01, value); });
    else if (payload.operation === "set_discount_percentage") variants.forEach((variant) => { variant.price = Math.max(0.01, variant.mrp * (1 - value / 100)); });
    else if (payload.operation === "set_exact_discount") variants.forEach((variant) => { variant.price = Math.max(0.01, value); });
    else if (payload.operation === "remove_discount") variants.forEach((variant) => { variant.price = variant.mrp; });
    else if (payload.operation === "add_stock") variants.forEach((variant) => { variant.stock += Math.max(0, Math.trunc(value)); });
    else if (payload.operation === "reduce_stock") variants.forEach((variant) => { variant.stock = Math.max(0, variant.stock - Math.max(0, Math.trunc(value))); });
    else if (payload.operation === "set_stock") variants.forEach((variant) => { variant.stock = Math.max(0, Math.trunc(value)); });
    else if (payload.operation === "activate") product.isActive = true;
    else if (payload.operation === "deactivate") product.isActive = false;
    else if (payload.operation === "archive") { product.isArchived = true; product.isActive = false; }
    else if (payload.operation === "mark_featured") product.featured = true;
    else if (payload.operation === "remove_featured") product.featured = false;
    else if (payload.operation === "set_weight") variants.forEach((variant) => { variant.weight = Math.max(0, value); });
    else if (payload.operation === "set_dimensions") variants.forEach((variant) => { variant.dimensions = { length: Number(payload.length) || 0, width: Number(payload.width) || 0, height: Number(payload.height) || 0 }; });
    else variants.forEach((variant) => { variant.price = calculatePrice(variant, payload.operation, value); });
    return product.save();
  }));
  return { updated: products.length };
}

export async function updateInventory(id, { mode, quantity, variantId }) {
  const product = await Product.findById(id);
  if (!product) throw new ApiError("Product not found.", 404);
  const variant = variantId ? product.variants?.id(variantId) : product.variants?.find((item) => item.isActive && !item.isArchived);
  if (!variant || variant.isArchived) throw new ApiError("Product variant not found.", 404);
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0) throw new ApiError("Quantity must be a whole number of zero or more.", 400);
  if (mode === "reduce" && qty > variant.stock) throw new ApiError("Quantity cannot reduce stock below zero.", 400);
  variant.stock = mode === "set" ? qty : mode === "reduce" ? Math.max(0, variant.stock - qty) : variant.stock + qty;
  await product.save();
  return product;
}


function normalizeGalleryImage(payload) {
  const source = payload.image || {};
  const url = typeof source === "string" ? source : source.url || payload.url;
  if (!url) throw new ApiError("Gallery image is required.", 400);
  return { url, publicId: source.publicId || source.public_id || payload.publicId || "", provider: source.provider || payload.provider || "cloudinary" };
}

export async function listGalleryImages() {
  return GalleryImage.find().sort({ sortOrder: 1, createdAt: 1 });
}

export async function saveGalleryImage(payload, id) {
  const data = { title: payload.title || "", description: payload.description || "", isVisible: payload.isVisible !== false };
  if (payload.image || payload.url) data.image = normalizeGalleryImage(payload);
  if (payload.sortOrder !== undefined) data.sortOrder = Number(payload.sortOrder) || 0;
  if (id) {
    const image = await GalleryImage.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!image) throw new ApiError("Gallery image not found.", 404);
    return image;
  }
  if (data.sortOrder === undefined) {
    const last = await GalleryImage.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
    data.sortOrder = (last?.sortOrder || 0) + 1;
  }
  return GalleryImage.create(data);
}

export async function deleteGalleryImage(id) {
  const image = await GalleryImage.findByIdAndDelete(id);
  if (!image) throw new ApiError("Gallery image not found.", 404);
  if (image.image?.publicId) await deleteImage(image.image.publicId);
  return image;
}

export async function reorderGalleryImages(ids = []) {
  if (!Array.isArray(ids)) throw new ApiError("Gallery order is required.", 400);
  await GalleryImage.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { sortOrder: index + 1 } } })));
  return listGalleryImages();
}
export async function listCategories() { return Category.find().sort({ name: 1 }); }
export async function saveCategory(payload, id) { const data = { name: payload.name, slug: payload.slug || slugify(payload.name), description: payload.description, image: payload.image, isActive: payload.isActive !== false }; return id ? Category.findByIdAndUpdate(id, data, { new: true, runValidators: true }) : Category.create(data); }

export const listOffers = () => Offer.find().populate("category", "name").populate("products", "title").sort({ createdAt: -1 });
export const saveOffer = (payload, userId, id) => id ? Offer.findByIdAndUpdate(id, payload, { new: true, runValidators: true }) : Offer.create({ ...payload, createdBy: userId });
export const deleteOffer = (id) => Offer.findByIdAndDelete(id);
export const listCoupons = () => Coupon.find().populate("categories", "name").populate("products", "title").sort({ createdAt: -1 });
export const saveCoupon = (payload, userId, id) => {
  const discountValue = Number(payload.discountValue);
  const discountType = payload.discountType;
  if (!normalizeCouponCode(payload.code)) throw new ApiError("Coupon code is required.", 400);
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new ApiError("Discount value must be greater than zero.", 400);
  if (discountType === "PERCENTAGE" && discountValue > 100) throw new ApiError("Percentage discount cannot exceed 100%.", 400);
  if (!payload.startDate || !payload.expiryDate || String(payload.startDate).slice(0, 10) > String(payload.expiryDate).slice(0, 10)) throw new ApiError("Coupon expiry date must be on or after the start date.", 400);
  const data = { ...payload, code: normalizeCouponCode(payload.code), discountValue, startDate: String(payload.startDate).slice(0, 10), expiryDate: String(payload.expiryDate).slice(0, 10) };
  return id ? Coupon.findByIdAndUpdate(id, data, { new: true, runValidators: true }) : Coupon.create({ ...data, createdBy: userId });
};
export const deleteCoupon = (id) => Coupon.findByIdAndDelete(id);
export const listMessages = () => ContactMessage.find({ status: { $ne: "ARCHIVED" } }).sort({ createdAt: -1 });
export const updateMessage = (id, status) => ContactMessage.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
export const listAuditLogs = (query) => AdminAuditLog.find(query.search ? { summary: new RegExp(query.search, "i") } : {}).populate("admin", "name email adminRole").sort({ createdAt: -1 }).limit(100);

export async function listCustomers() {
  return User.aggregate([{ $match: { role: "user" } }, { $lookup: { from: "orders", localField: "_id", foreignField: "user", as: "orders" } }, { $project: { name: 1, email: 1, phone: 1, isDisabled: 1, createdAt: 1, orderCount: { $size: "$orders" }, totalSpent: { $sum: "$orders.totalAmount" }, lastOrder: { $max: "$orders.createdAt" } } }]);
}

export async function listPayments(query) {
  const filter = {};
  if (query.status) filter.paymentStatus = query.status;
  return Order.find(filter).populate("user", "name email").select("user paymentMethod paymentStatus cfPaymentId razorpayPaymentId totalAmount createdAt").sort({ createdAt: -1 }).limit(100);
}

export async function reports(type = "sales") {
  const start = new Date(Date.now() - 30 * 86400000);
  if (type === "products") return Product.find().sort({ "variants.stock": 1 }).limit(50);
  return Order.aggregate([{ $match: { createdAt: { $gte: start } } }, { $group: { _id: "$paymentStatus", orders: { $sum: 1 }, total: { $sum: "$totalAmount" } } }]);
}

export async function listAdmins() { return User.find({ role: "admin" }).select("name email adminRole isDisabled createdAt updatedAt").sort({ createdAt: -1 }); }
export async function updateAdminRole(id, adminRole) { return User.findByIdAndUpdate(id, { role: "admin", adminRole }, { new: true, runValidators: true }).select("name email adminRole isDisabled"); }

export async function globalAdminSearch(term, user, hasPermission) {
  const q = String(term || "").trim();
  if (q.length < 2) return { pages: [], products: [], orders: [], customers: [], categories: [] };
  const pageMap = ["Dashboard", "Orders", "Products", "Inventory", "Categories", "Offers", "Coupons", "Shipping", "Customers", "Payments", "Messages", "Gallery", "Reports", "Admin Users", "Audit Logs", "Settings"];
  const pages = pageMap.filter((label) => label.toLowerCase().includes(q.toLowerCase())).slice(0, 5).map((label) => ({ label, path: `/admin/${label.toLowerCase().replaceAll(" ", "-").replace("dashboard", "")}`.replace(/\/$/, "") || "/admin" }));
  const [products, categories, orders, customers] = await Promise.all([
    hasPermission(user, "products.read") ? Product.find({ $or: [{ title: new RegExp(q, "i") }, { sku: new RegExp(q, "i") }] }).select("title sku slug").limit(5) : [],
    hasPermission(user, "categories.read") ? Category.find({ name: new RegExp(q, "i") }).select("name slug").limit(5) : [],
    hasPermission(user, "orders.read") && q.length >= 3 ? Order.find(q.match(/^[a-f\d]{24}$/i) ? { _id: q } : { "shippingAddress.fullName": new RegExp(q, "i") }).select("shippingAddress totalAmount orderStatus").limit(5) : [],
    hasPermission(user, "customers.read") ? User.find({ role: "user", $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] }).select("name email").limit(5) : [],
  ]);
  return { pages, products, categories, orders, customers };
}












