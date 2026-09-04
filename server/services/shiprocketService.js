// Shiprocket delivery integration and shipment status synchronization.
import crypto from "node:crypto";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import StoreSettings from "../models/StoreSettings.js";
import { ApiError } from "../utils/ApiError.js";
import { logExternalFailure } from "./serviceStatusService.js";
import { sendShipmentReadyEmail } from "./emailService.js";

const API_BASE = "https://apiv2.shiprocket.in/v1/external";
let authCache = { token: "", expiresAt: 0 };

export async function assertShiprocketEnabled() {
  if (!env.shiprocket.enabled) throw new ApiError("Shipping is temporarily unavailable.", 503);
  const settings = await StoreSettings.findOne({ key: "store" }).select("shiprocketEnabled").lean();
  if (settings?.shiprocketEnabled === false) throw new ApiError("Shipping is temporarily unavailable.", 503);
}

function requireConfig() {
  const missing = [];
  if (!env.shiprocket.email) missing.push("SHIPROCKET_EMAIL");
  if (!env.shiprocket.password) missing.push("SHIPROCKET_PASSWORD");
  if (!env.shiprocket.pickupLocation) missing.push("SHIPROCKET_PICKUP_LOCATION");
  if (!env.shiprocket.pickupPostcode) missing.push("SHIPROCKET_PICKUP_POSTCODE");
  if (missing.length) throw new ApiError(`Shiprocket configuration missing: ${missing.join(", ")}.`, 400);
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    logExternalFailure("shiprocket", error, { action: "parse_response" });
    throw new ApiError("Shipping integration is temporarily unavailable.", 502);
  }
  if (!response.ok) {
    const message = data.message || data.error || data.errors?.[0]?.message || "Shiprocket request failed.";
    logExternalFailure("shiprocket", new Error(message), { status: response.status });
    throw new ApiError(response.status >= 500 ? "Shipping integration is temporarily unavailable." : "Shiprocket could not process this shipment.", response.status >= 500 ? 502 : 400);
  }
  return data;
}

async function authenticate() {
  requireConfig();
  if (authCache.token && Date.now() < authCache.expiresAt) return authCache.token;
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
    });
  } catch (error) {
    logExternalFailure("shiprocket", error, { action: "authenticate" });
    throw new ApiError("Shipping integration is temporarily unavailable.", 503);
  }
  const data = await parseResponse(response);
  if (!data.token) throw new ApiError("Shiprocket authentication did not return a token.", 502);
  authCache = { token: data.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return data.token;
}

async function shiprocketRequest(path, options = {}) {
  const token = await authenticate();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    logExternalFailure("shiprocket", error, { action: path });
    throw new ApiError("Shipping integration is temporarily unavailable.", 503);
  }
  return parseResponse(response);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function productMetric(product, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], product);
    if (asNumber(value) > 0) return asNumber(value);
  }
  return 0;
}

function getPackageDetails(order) {
  const defaults = env.shiprocket;
  let weight = 0;
  let length = defaults.defaultLengthCm;
  let breadth = defaults.defaultBreadthCm;
  let height = defaults.defaultHeightCm;

  for (const item of order.products || []) {
    const product = item.product || {};
    const itemWeight = productMetric(product, ["shippingWeight", "packageWeight", "weight", "dimensions.weight"]);
    if (itemWeight > 0) weight += itemWeight * item.quantity;
    length = Math.max(length, productMetric(product, ["dimensions.length", "packageDimensions.length", "length"]));
    breadth = Math.max(breadth, productMetric(product, ["dimensions.breadth", "dimensions.width", "packageDimensions.breadth", "packageDimensions.width", "breadth", "width"]));
    height = Math.max(height, productMetric(product, ["dimensions.height", "packageDimensions.height", "height"]));
  }

  if (!weight) weight = defaults.defaultWeightKg;
  if (!weight || !length || !breadth || !height) {
    throw new ApiError("Shipping package weight and dimensions are required before creating a Shiprocket shipment.", 400);
  }
  return { weight: Number(weight.toFixed(2)), length, breadth, height };
}

function splitName(fullName = "Customer") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Customer", lastName: parts.slice(1).join(" ") || parts[0] || "Customer" };
}

function buildOrderPayload(order, packageDetails) {
  const address = order.shippingAddress;
  const customer = splitName(address.fullName || order.user?.name);
  const isCod = order.paymentMethod === "cod";
  return {
    order_id: order._id.toString(),
    order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace("T", " "),
    pickup_location: env.shiprocket.pickupLocation,
    billing_customer_name: customer.firstName,
    billing_last_name: customer.lastName,
    billing_address: address.street,
    billing_city: address.city,
    billing_pincode: address.postalCode,
    billing_state: address.state,
    billing_country: address.country || "India",
    billing_email: order.user?.email || "support@ss-oil-mill.local",
    billing_phone: address.phone || order.user?.phone || "9999999999",
    shipping_is_billing: true,
    order_items: order.products.map((item) => ({
      name: `${item.title}${item.variantLabel ? ` - ${item.variantLabel}` : ""}`,
      sku: item.variantSku || item.product?._id?.toString?.() || item.product?.toString?.() || item.title,
      units: item.quantity,
      selling_price: item.price,
    })),
    payment_method: isCod ? "COD" : "Prepaid",
    sub_total: order.totalAmount,
    length: packageDetails.length,
    breadth: packageDetails.breadth,
    height: packageDetails.height,
    weight: packageDetails.weight,
  };
}

export function selectCourier(serviceability) {
  const companies = serviceability?.data?.available_courier_companies || serviceability?.available_courier_companies || [];
  if (!Array.isArray(companies) || companies.length === 0) throw new ApiError("No Shiprocket courier is serviceable for this order.", 400);
  const cost = (item) => asNumber(item.freight_charge || item.rate);
  const days = (item) => asNumber(item.estimated_delivery_days || item.etd_hours) || 999;
  const priced = companies.filter((item) => cost(item) > 0);
  if (!priced.length) throw new ApiError("Shiprocket did not return a valid shipping rate.", 502);
  const minimumCost = Math.min(...priced.map(cost));
  const selected = priced.filter((item) => cost(item) <= minimumCost + 10).sort((a, b) => days(a) - days(b) || cost(a) - cost(b))[0];
  const courierId = selected.courier_company_id || selected.courier_id;
  if (!courierId) throw new ApiError("Shiprocket did not return a courier id.", 502);
  return { courierId, courierName: selected.courier_name || selected.name || "Shiprocket courier", estimatedDelivery: selected.etd || selected.estimated_delivery_days, shippingCost: cost(selected) };
}

export async function getShippingRate({ deliveryPincode, weight, paymentMethod = "prepaid", declaredValue = 0 }) {
  await assertShiprocketEnabled();
  if (!/^\d{6}$/.test(String(deliveryPincode || ""))) throw new ApiError("Enter a valid 6-digit delivery PIN code.", 400);
  if (!(Number(weight) > 0)) throw new ApiError("Shipment weight is required.", 400);
  const data = await shiprocketRequest(`/courier/serviceability/?pickup_postcode=572106&delivery_postcode=${encodeURIComponent(deliveryPincode)}&weight=${Number(weight).toFixed(2)}&cod=${paymentMethod === "cod" ? 1 : 0}&declared_value=${Math.max(1, Math.round(declaredValue))}`);
  return selectCourier(data);
}

function getTrackingUrl(awbCode) {
  return awbCode ? `https://shiprocket.co/tracking/${awbCode}` : "";
}

function trustedTrackingUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "shiprocket.co" || host.endsWith(".shiprocket.co") || host === "shiprocket.in" || host.endsWith(".shiprocket.in")) ? url.toString() : "";
  } catch {
    return "";
  }
}

function recordStatus(order, status, source = "shiprocket", createdAt = new Date()) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const last = history[history.length - 1];
  if (last?.status !== status) order.statusHistory = [...history, { status, source, createdAt }];
}

function secretsMatch(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

const shippingProgress = { pending: 0, shiprocket_order_created: 1, awb_assigned: 2, ready_for_pickup: 3, picked_up: 4, shipped: 4, in_transit: 5, out_for_delivery: 6, delivered: 7 };

async function sendShipmentEmailOnce(order) {
  if (order.shipmentEmailSentAt || !order.awbCode) return;
  const result = await sendShipmentReadyEmail(order);
  if (result?.skipped) return;
  order.shipmentEmailSentAt = new Date();
  await order.save({ validateBeforeSave: false });
}

function parseEstimatedDelivery(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractAwb(assignResponse) {
  return assignResponse?.response?.data?.awb_code || assignResponse?.data?.awb_code || assignResponse?.awb_code || "";
}

function extractLabelUrl(labelResponse) {
  return labelResponse?.label_url || labelResponse?.label_url_download || labelResponse?.response?.label_url || labelResponse?.data?.label_url || "";
}

function extractManifestUrl(manifestResponse) {
  return manifestResponse?.manifest_url || manifestResponse?.manifest_url_download || manifestResponse?.response?.manifest_url || manifestResponse?.data?.manifest_url || "";
}

async function loadOrder(orderId) {
  const order = await Order.findById(orderId).populate("user", "name email phone").populate("products.product");
  if (!order) throw new ApiError("Order not found.", 404);
  return order;
}

async function failShipment(order, error, status = "failed") {
  order.shippingStatus = status;
  order.shippingFailureReason = /weight|dimensions|configuration|payment|confirm/i.test(error.message || "") ? error.message : "Unable to create shipment for this order. Please retry.";
  await order.save();
  throw error;
}

export async function getShipmentTracking(orderId, user) {
  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) throw new ApiError("Order not found.", 404);
  if (user.role !== "admin" && order.user._id.toString() !== user._id.toString()) throw new ApiError("You cannot access this tracking details.", 403);
  return { order, steps: [] };
}

export async function createReadyToShipShipment(orderId) {
  await assertShiprocketEnabled();
  let order = await loadOrder(orderId);
  if (order.orderStatus === "cancelled") throw new ApiError("Cancelled orders cannot be shipped.", 400);
  if (order.orderStatus === "placed") throw new ApiError("Confirm the order before preparing its shipment.", 400);
  if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid") throw new ApiError("Online payment orders must be paid before sending to Shiprocket.", 400);
  if (order.awbCode) { await sendShipmentEmailOnce(order); return order; }

  const attemptAt = new Date();
  const staleLock = new Date(attemptAt.getTime() - 10 * 60 * 1000);
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, awbCode: { $in: [null, ""] }, $or: [{ shipmentCreationStartedAt: { $exists: false } }, { shipmentCreationStartedAt: null }, { shipmentCreationStartedAt: { $lt: staleLock } }] },
    { $set: { shipmentCreationStartedAt: attemptAt, shipmentLastAttemptAt: attemptAt }, $inc: { shipmentAttemptCount: 1 } },
    { new: true }
  ).populate("user", "name email phone").populate("products.product");
  if (!claimed) {
    const current = await loadOrder(orderId);
    if (current.awbCode) return current;
    throw new ApiError("Shipment creation is already in progress for this order.", 409);
  }
  order = claimed;

  try {
    const packageDetails = getPackageDetails(order);
    if (!order.shiprocketShipmentId) {
      const created = await shiprocketRequest("/orders/create/adhoc", { method: "POST", body: buildOrderPayload(order, packageDetails) });
      order.shiprocketOrderId = created.order_id || created.shiprocket_order_id || created.data?.order_id || order.shiprocketOrderId;
      order.shiprocketShipmentId = created.shipment_id || created.data?.shipment_id || order.shiprocketShipmentId;
      order.shippingStatus = "shiprocket_order_created";
      recordStatus(order, "shiprocket_order_created");
      await order.save();
    }

    if (!order.shiprocketShipmentId) throw new ApiError("Shiprocket did not return a shipment id.", 502);

    const serviceability = await shiprocketRequest(`/courier/serviceability/?pickup_postcode=${encodeURIComponent(env.shiprocket.pickupPostcode)}&delivery_postcode=${encodeURIComponent(order.shippingAddress.postalCode)}&weight=${packageDetails.weight}&cod=${order.paymentMethod === "cod" ? 1 : 0}&declared_value=${Math.round(order.totalAmount)}`);
    const courier = selectCourier(serviceability);
    const assigned = await shiprocketRequest("/courier/assign/awb", { method: "POST", body: { shipment_id: order.shiprocketShipmentId, courier_id: courier.courierId } });
    const awbCode = extractAwb(assigned);
    if (!awbCode) throw new ApiError("Shiprocket did not return an AWB code.", 502);

    order.awbCode = awbCode;
    order.courierName = courier.courierName;
    order.trackingUrl = getTrackingUrl(awbCode);
    order.estimatedDelivery = parseEstimatedDelivery(courier.estimatedDelivery) || order.estimatedDelivery;
    order.shippingStatus = "ready_for_pickup";
    if (order.orderStatus === "confirmed") order.orderStatus = "packed";
    order.readyToShipAt = new Date();
    recordStatus(order, "packed");
    recordStatus(order, "awb_assigned");
    recordStatus(order, "ready_for_pickup");
    order.shippingFailureReason = "";
    order.shipmentCreationStartedAt = undefined;
    await order.save();
    await sendShipmentEmailOnce(order);
    return order;
  } catch (error) {
    order.shipmentCreationStartedAt = undefined;
    const status = /weight|dimensions|configuration/i.test(error.message || "") ? "requires_details" : "failed";
    return failShipment(order, error, status);
  }
}

export async function markShipmentHandedOver(orderId) {
  const order = await loadOrder(orderId);
  if (["picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) return order;
  if (order.orderStatus === "cancelled" || order.shippingStatus === "cancelled") throw new ApiError("Cancelled orders cannot be handed over.", 400);
  if (order.shippingStatus !== "ready_for_pickup" || !order.awbCode) throw new ApiError("The shipment must be ready with an AWB before handover.", 400);
  // Physical handover is recorded separately; customer pickup status remains
  // pending until Shiprocket confirms pickup through its signed webhook.
  order.shippingStatus = "ready_for_pickup";
  order.pickupStatus = "Handed over to Shiprocket";
  order.handedOverAt = order.handedOverAt || new Date();
  await order.save();
  return order;
}

export async function syncShiprocketWebhook(payload, headers = {}) {
  const expected = env.shiprocket.webhookSecret;
  if (!expected) throw new ApiError("Shiprocket webhook secret is not configured.", 503);
  const received = headers["x-shiprocket-token"] || headers["x-webhook-token"] || headers["x-shiprocket-signature"];
  if (!secretsMatch(received, expected)) throw new ApiError("Invalid Shiprocket webhook token.", 401);

  const awbCode = payload.awb || payload.awb_code || payload.awbCode;
  const shipmentId = payload.shipment_id || payload.shipmentId;
  const shiprocketOrderId = payload.order_id || payload.sr_order_id || payload.shiprocket_order_id;
  const query = awbCode ? { awbCode } : shipmentId ? { shiprocketShipmentId: String(shipmentId) } : { shiprocketOrderId: String(shiprocketOrderId || "") };
  const order = await Order.findOne(query);
  if (!order) throw new ApiError("Order not found for Shiprocket webhook.", 404);

  const rawStatus = String(payload.current_status || payload.shipment_status || payload.status || "").toLowerCase();
  const normalized = rawStatus.includes("out for delivery") ? "out_for_delivery"
    : rawStatus.includes("delivered") ? "delivered"
    : rawStatus.includes("picked up") || rawStatus.includes("pickup done") ? "picked_up"
    : rawStatus.includes("in transit") ? "in_transit"
    : rawStatus.includes("pickup scheduled") || rawStatus.includes("ready to ship") ? "ready_for_pickup"
    : rawStatus.includes("shipment created") || rawStatus.includes("awb assigned") ? order.shippingStatus
    : rawStatus.includes("cancel") ? "cancelled"
    : rawStatus.includes("rto") ? "rto"
    : rawStatus.includes("ship") ? "shipped"
    : order.shippingStatus;

  order.$locals ||= {};
  order.$locals.webhookStatusChanged = false;
  if (order.orderStatus === "cancelled" && normalized !== "cancelled") return order;
  if (order.shippingStatus === "delivered" && normalized !== "delivered") return order;
  if (shippingProgress[normalized] != null && shippingProgress[order.shippingStatus] != null && shippingProgress[normalized] < shippingProgress[order.shippingStatus]) return order;

  order.$locals.webhookStatusChanged = order.shippingStatus !== normalized;
  order.shippingStatus = normalized;
  if (normalized === "delivered") order.orderStatus = "delivered";
  if (["picked_up", "shipped", "in_transit", "out_for_delivery"].includes(normalized) && order.orderStatus !== "delivered") order.orderStatus = "shipped";
  if (normalized === "cancelled") order.orderStatus = "cancelled";
  const eventDateValue = payload.event_time || payload.updated_at || payload.timestamp || payload.created_at;
  const eventDate = eventDateValue && !Number.isNaN(new Date(eventDateValue).getTime()) ? new Date(eventDateValue) : new Date();
  recordStatus(order, normalized, "shiprocket", eventDate);
  order.trackingUrl = trustedTrackingUrl(payload.tracking_url) || order.trackingUrl || getTrackingUrl(order.awbCode);
  await order.save();
  return order;
}



