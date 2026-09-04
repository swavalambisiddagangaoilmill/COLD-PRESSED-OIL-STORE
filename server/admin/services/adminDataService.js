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
import { createReadyToShipShipment, markShipmentHandedOver } from "../../services/shiprocketService.js";
import { createAdminNotification, createInventoryNotifications } from "../../services/adminNotificationService.js";
import { normalizeCouponCode } from "../../services/couponService.js";
import { deleteImage } from "../../services/uploadService.js";
import { ApiError } from "../../utils/ApiError.js";
import { slugify } from "../../utils/slugify.js";
import { withOrderTotals } from "../../utils/orderTotals.js";
import { createProductWithGeneratedSku, prepareProductVariants } from "../../services/productSkuService.js";
import { sendOrderCancellationOnce, sendOrderConfirmationEmail } from "../../services/emailService.js";
import { createCategory, listCategories as listCanonicalCategories, requireCanonicalCategory, updateCategory } from "../../services/categoryService.js";
import { priceProducts } from "../../services/offerPricingService.js";
import { sizeInLitres } from "../../utils/shippingDefaults.js";
import mongoose from "mongoose";

const orderTransitions = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function getSettings() {
  return StoreSettings.findOneAndUpdate({ key: "store" }, { $setOnInsert: { key: "store" } }, { upsert: true, new: true });
}

export async function updateSettings(payload) {
  const allowed = ["storeName", "currency", "supportEmail", "supportPhone", "whatsappNumber", "minimumOrderAmount", "orderPrefix", "lowStockThreshold", "allowOutOfStockVisibility", "preventOutOfStockCheckout", "freeDeliveryThreshold", "defaultPackagingWeight", "defaultPackageLength", "defaultPackageWidth", "defaultPackageHeight", "shiprocketEnabled", "codEnabled", "onlinePaymentEnabled", "maintenanceMode", "announcementBarEnabled", "customerRegistrationEnabled", "newsletterEnabled", "factoryAddress", "businessHours", "googleMapsLink"];
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
    Product.countDocuments({ stock: { $lte: settings.lowStockThreshold }, isArchived: { $ne: true } }),
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
  return { items: items.map(withOrderTotals), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function updateOrderStatus(id, nextStatus) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError("Order not found.", 404);
  if (order.orderStatus === nextStatus) {
    if (nextStatus === "confirmed" && !order.confirmationEmailSentAt) await sendConfirmationOnce(order);
    if (nextStatus === "cancelled" && !order.cancellationEmailSentAt) await sendOrderCancellationOnce(order);
    return order;
  }
  if (!orderTransitions[order.orderStatus]?.includes(nextStatus)) throw new ApiError("Invalid order status transition.", 400);
  const previousStatus = order.orderStatus;
  const previousShippingStatus = order.shippingStatus;
  order.orderStatus = nextStatus;
  const changedAt = new Date();
  order.statusHistory = [...(order.statusHistory || []), { status: nextStatus, source: "admin", createdAt: changedAt }];
  if (nextStatus === "confirmed") order.confirmedAt = order.confirmedAt || changedAt;
  if (nextStatus === "cancelled") order.shippingStatus = "cancelled";
  if (nextStatus === "shipped" && !["picked_up", "in_transit", "out_for_delivery"].includes(order.shippingStatus)) order.shippingStatus = "shipped";
  if (nextStatus === "delivered") order.shippingStatus = "delivered";
  await order.save();
  if (nextStatus === "confirmed") await sendConfirmationOnce(order);
  if (nextStatus === "cancelled" && !order.inventoryRestoredAt) {
    try {
      await Product.bulkWrite(order.products.map((item) => ({ updateOne: item.variant ? { filter: { _id: item.product, "variants._id": item.variant }, update: { $inc: { "variants.$.stock": item.requiredStockLitres || item.quantity } } } : { filter: { _id: item.product }, update: { $inc: { stock: item.quantity } } } })));
      order.inventoryRestoredAt = new Date();
      await order.save();
      const restoredProducts = await Product.find({ _id: { $in: order.products.map((item) => item.product) } });
      await Promise.allSettled(restoredProducts.map((product) => createInventoryNotifications(product)));
    } catch (error) {
      order.orderStatus = previousStatus;
      order.shippingStatus = previousShippingStatus;
      await order.save().catch(() => undefined);
      throw error;
    }
  }
  const notification = nextStatus === "cancelled" ? { type: "order_cancelled", title: "Order Cancelled", description: `Order ${order._id} was cancelled.` } : nextStatus === "delivered" ? { type: "order_delivered", title: "Order Delivered", description: `Order ${order._id} was delivered.` } : null;
  if (notification) await Promise.allSettled([createAdminNotification({ category: "orders", ...notification, related: { kind: "Order", id: order._id, label: `Order ${order._id}`, path: "/admin/orders" } })]);
  if (nextStatus === "cancelled") await sendOrderCancellationOnce(order);
  return order;
}

async function sendConfirmationOnce(order) {
  if (order.confirmationEmailSentAt) return;
  await order.populate?.("user", "name email");
  const result = await sendOrderConfirmationEmail(order);
  if (result?.skipped) return;
  order.confirmationEmailSentAt = new Date();
  await order.save({ validateBeforeSave: false });
}

export async function readyToShip(id) { return createReadyToShipShipment(id); }
export async function handoverShipment(id) { return markShipmentHandedOver(id); }

export async function listProducts(query) {
  const page = Number(query.page) || 1; const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { isArchived: { $ne: true } };
  if (query.category) filter.category = query.category;
  if (query.active) filter.isActive = query.active === "true";
  if (query.featured) filter.featured = query.featured === "true";
  if (query.stock === "low") filter.stock = { $gt: 0, $lte: 10 };
  if (query.stock === "out") filter.stock = 0;
  if (query.search) filter.$text = { $search: query.search };
  const [items, total] = await Promise.all([Product.find(filter).populate("category", "name slug").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Product.countDocuments(filter)]);
  return { items: await priceProducts(items), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function saveProduct(payload, id) {
  const allowed = ["title", "description", "benefits", "price", "discountPrice", "stock", "category", "images", "featured", "bestSeller", "newArrival", "codEnabled", "onlinePaymentEnabled", "returnEligible", "exchangeEligible", "isActive", "size", "variants"];
  const data = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)));
  if (data.title) data.slug = slugify(data.title);
  if (data.category) await requireCanonicalCategory(data.category);
  const current = id ? await Product.findById(id) : null;
  if (id && !current) throw new ApiError("Product not found.", 404);
  if (id && Array.isArray(data.variants)) data.variants = await prepareProductVariants(data.variants, current.sku, current.variants || []);
  const product = id ? await Product.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate("category", "name slug") : await createProductWithGeneratedSku(data);
  return id ? product : product.populate("category", "name slug");
}

export async function archiveProduct(id) {
  const product = await Product.findByIdAndUpdate(id, { isArchived: true, isActive: false }, { new: true });
  if (!product) throw new ApiError("Product not found.", 404);
  return product;
}

function buildBulkFilter(target) {
  const filter = { isArchived: { $ne: true } };
  if (target.productIds?.length) filter._id = { $in: target.productIds };
  if (target.category) filter.category = target.category;
  if (target.featured !== undefined) filter.featured = Boolean(target.featured);
  if (target.active !== undefined) filter.isActive = Boolean(target.active);
  if (target.stockStatus === "low") filter.stock = { $gt: 0, $lte: 10 };
  if (target.stockStatus === "out") filter.stock = 0;
  return filter;
}

function calculatePrice(product, operation, value) {
  const amount = Number(value) || 0;
  if (operation === "increase_percentage") return Math.round(product.price * (1 + amount / 100));
  if (operation === "decrease_percentage") return Math.max(0, Math.round(product.price * (1 - amount / 100)));
  if (operation === "increase_fixed") return Math.round(product.price + amount);
  if (operation === "decrease_fixed") return Math.max(0, Math.round(product.price - amount));
  return product.price;
}

export async function bulkPricePreview(payload) {
  const products = await Product.find(buildBulkFilter(payload.target || {})).limit(20);
  return { count: products.length, examples: products.slice(0, 5).map((product) => ({ id: product._id, title: product.title, before: product.price, after: calculatePrice(product, payload.operation, payload.value) })) };
}

export async function bulkPriceApply(payload) {
  if (payload.operation === "move_category") await requireCanonicalCategory(payload.category);
  const products = await Product.find(buildBulkFilter(payload.target || {}));
  await Promise.all(products.map((product) => {
    const value = Number(payload.value) || 0;
    if (payload.operation === "set_exact_price") product.price = Math.max(0, Math.round(value));
    else if (payload.operation === "set_discount_percentage") product.discountPrice = Math.max(0, Math.round(product.price * (1 - value / 100)));
    else if (payload.operation === "set_exact_discount") product.discountPrice = Math.max(0, Math.round(value));
    else if (payload.operation === "remove_discount") product.discountPrice = undefined;
    else if (payload.operation === "add_stock") product.stock += Math.max(0, Math.trunc(value));
    else if (payload.operation === "reduce_stock") product.stock = Math.max(0, product.stock - Math.max(0, Math.trunc(value)));
    else if (payload.operation === "set_stock") product.stock = Math.max(0, Math.trunc(value));
    else if (payload.operation === "activate") product.isActive = true;
    else if (payload.operation === "deactivate") product.isActive = false;
    else if (payload.operation === "archive") { product.isArchived = true; product.isActive = false; }
    else if (payload.operation === "mark_featured") product.featured = true;
    else if (payload.operation === "remove_featured") product.featured = false;
    else if (payload.operation === "move_category" && payload.category) product.category = payload.category;
    else if (payload.operation === "set_weight") product.weight = Math.max(0, value);
    else if (payload.operation === "set_dimensions") product.dimensions = { length: Number(payload.length) || 0, width: Number(payload.width) || 0, height: Number(payload.height) || 0 };
    else product.price = calculatePrice(product, payload.operation, value);
    return product.save();
  }));
  return { updated: products.length };
}

export async function updateInventory(id, { mode, quantity, variantId }) {
  const product = await Product.findById(id);
  if (!product) throw new ApiError("Product not found.", 404);
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0) throw new ApiError("Stock litres must be zero or more.", 400);
  const variant = variantId ? product.variants?.id(variantId) : null;
  if (variantId && !variant) throw new ApiError("Selected variant does not belong to this product.", 400);
  const target = variant || product;
  if (mode === "reduce" && qty > target.stock) throw new ApiError("Litres cannot reduce stock below zero.", 400);
  if (variant) {
    const next = mode === "set" ? qty : mode === "reduce" ? target.stock - qty : target.stock + qty;
    const updated = await Product.findOneAndUpdate(
      { _id: id, variants: { $elemMatch: { _id: variantId, ...(mode === "reduce" ? { stock: { $gte: qty } } : {}) } } },
      { $set: { "variants.$.stock": next, "variants.$.litres": Number(variant.litres || sizeInLitres(variant.size)), "variants.$.stockUnit": "LITRES" } },
      { new: true }
    );
    if (!updated) throw new ApiError("Variant stock changed concurrently. Refresh and retry.", 409);
    return updated;
  }
  target.stock = mode === "set" ? qty : mode === "reduce" ? target.stock - qty : target.stock + qty;
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
export async function listCategories() { return listCanonicalCategories(); }
export async function saveCategory(payload, id) { return id ? updateCategory(id, payload) : createCategory(payload); }

export const listOffers = () => Offer.find().populate("category", "name").populate("categories", "name").populate("products", "title variants").sort({ createdAt: -1 });
export async function saveOffer(payload, userId, id) {
  const uniqueIds = (values = []) => [...new Set(values.map((value) => String(value?._id || value)).filter(Boolean))];
  const uniqueVariants = [...new Map((payload.variants || []).map((item) => [`${item.product?._id || item.product}:${item.variant?._id || item.variant}`, { product: String(item.product?._id || item.product), variant: String(item.variant?._id || item.variant) }])).values()];
  const targetType = payload.targetType;
  if (!["CATEGORY", "VARIANT", "CUSTOM"].includes(targetType)) throw new ApiError("Select a valid offer targeting mode.", 400);
  const data = { ...payload, targetType, discountType: "PERCENTAGE", discountValue: Number(payload.discountValue), categories: targetType === "VARIANT" ? [] : uniqueIds(payload.categories), products: targetType === "CUSTOM" ? uniqueIds(payload.products) : [], variants: targetType === "CATEGORY" ? [] : uniqueVariants };
  if (!Number.isFinite(data.discountValue) || data.discountValue <= 0 || data.discountValue > 100) throw new ApiError("Discount percentage must be between 0 and 100.", 400);
  const startDate = new Date(data.startDate); const endDate = new Date(data.endDate);
  if (!data.startDate || !data.endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) throw new ApiError("Offer end date must be after its start date.", 400);
  data.startDate = startDate; data.endDate = endDate;
  if (targetType === "CATEGORY" && !data.categories.length || targetType === "VARIANT" && !data.variants.length || targetType === "CUSTOM" && !data.categories.length && !data.products.length && !data.variants.length) throw new ApiError("Please select at least one target.", 400);
  const allIds = [...data.categories, ...data.products, ...data.variants.flatMap((item) => [item.product, item.variant])];
  if (allIds.some((value) => !mongoose.isValidObjectId(value))) throw new ApiError("One or more selected targets are invalid.", 400);
  await Promise.all(data.categories.map(requireCanonicalCategory));
  const selectedProducts = await Product.find({ _id: { $in: [...data.products, ...data.variants.map((item) => item.product)] } }).select("variants");
  const productMap = new Map(selectedProducts.map((product) => [String(product._id), product]));
  if (productMap.size !== new Set([...data.products, ...data.variants.map((item) => String(item.product))]).size) throw new ApiError("One or more selected products are invalid.", 400);
  if (data.variants.some((item) => !productMap.get(String(item.product))?.variants.some((variant) => String(variant._id) === String(item.variant)))) throw new ApiError("One or more selected variants are invalid.", 400);
  try {
    if (id) {
      const offer = await Offer.findById(id);
      if (!offer) throw new ApiError("Offer not found.", 404);
      offer.set(data);
      return await offer.save();
    }
    return await Offer.create({ ...data, createdBy: userId });
  } catch (error) {
    if (error?.code === 11000 && (error.keyPattern?.fingerprint || error.keyValue?.fingerprint)) {
      const existing = await Offer.findOne({ fingerprint: error.keyValue?.fingerprint }).select("+fingerprint");
      if (existing && !id) return existing;
      throw new ApiError("This offer could not be saved because it conflicts with an existing offer.", 409, [{ field: "targets", message: "An identical offer already exists." }]);
    }
    throw error;
  }
}
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
  return (await Order.find(filter).populate("user", "name email").select("user products subtotal shippingAmount couponDiscount taxAmount paymentMethod paymentStatus cashfreePaymentId razorpayPaymentId totalAmount createdAt").sort({ createdAt: -1 }).limit(100).lean()).map(withOrderTotals);
}

export async function reports(type = "sales") {
  const start = new Date(Date.now() - 30 * 86400000);
  if (type === "products") return Product.find().populate("category", "name").sort({ stock: 1 }).limit(50);
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












