// Shiprocket delivery integration and shipment status synchronization.
import crypto from "node:crypto";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import StoreSettings from "../models/StoreSettings.js";
import { ApiError } from "../utils/ApiError.js";
import { customerOrderView } from "../utils/customerCommerceView.js";
import { logExternalFailure } from "./serviceStatusService.js";
import { sendShipmentReadyEmail, sendShipmentStatusEmail } from "./emailService.js";
import { shipmentDataFromOrder } from "./shipmentDataService.js";

const API_BASE = "https://apiv2.shiprocket.in/v1/external";
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000;
let authCache = { token: "", expiresAt: 0 };
let authenticationPromise = null;

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
    if (response.status === 429) throw new ApiError("Shipping service is busy. Please retry shortly.", 429);
    throw new ApiError(response.status >= 500 ? "Shipping integration is temporarily unavailable." : "Shiprocket could not process this shipment.", response.status >= 500 ? 502 : 400);
  }
  return data;
}

async function requestAuthentication(transientRetry = true) {
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logExternalFailure("shiprocket", error, { action: "authenticate" });
    if (transientRetry) return requestAuthentication(false);
    throw new ApiError("Shipping integration is temporarily unavailable.", 503);
  }
  if (response.status >= 500 && transientRetry) return requestAuthentication(false);
  return parseResponse(response);
}

async function authenticate() {
  requireConfig();
  if (authCache.token && Date.now() < authCache.expiresAt) return authCache.token;
  if (authenticationPromise) return authenticationPromise;
  authenticationPromise = (async () => {
    const data = await requestAuthentication();
    if (!data.token || typeof data.token !== "string") throw new ApiError("Shipping integration is temporarily unavailable.", 502);
    authCache = { token: data.token, expiresAt: Date.now() + TOKEN_LIFETIME_MS - TOKEN_REFRESH_BUFFER_MS };
    return data.token;
  })();
  try {
    return await authenticationPromise;
  } finally {
    authenticationPromise = null;
  }
}

function clearAuthentication() {
  authCache = { token: "", expiresAt: 0 };
}

export function resetShiprocketAuthForTests() {
  clearAuthentication();
  authenticationPromise = null;
}

async function shiprocketRequest(path, options = {}, authRetry = true, transientRetry = true) {
  const token = await authenticate();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logExternalFailure("shiprocket", error, { action: path });
    if ((options.method || "GET") === "GET" && transientRetry) return shiprocketRequest(path, options, authRetry, false);
    throw new ApiError("Shipping integration is temporarily unavailable.", 503);
  }
  if (response.status === 401 && authRetry) {
    clearAuthentication();
    return shiprocketRequest(path, options, false, transientRetry);
  }
  if (response.status >= 500 && (options.method || "GET") === "GET" && transientRetry) return shiprocketRequest(path, options, authRetry, false);
  return parseResponse(response);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function splitName(fullName = "Customer") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Customer", lastName: parts.slice(1).join(" ") || parts[0] || "Customer" };
}

function buildOrderPayload(order, packageDetails) {
  const address = order.shippingAddress;
  const customer = splitName(address.fullName || order.user?.name);
  const isCod = order.paymentMethod === "cod";
  const email = String(order.user?.email || "").trim();
  const phone = String(address.phone || order.user?.phone || "").replace(/\D/g, "");
  if (!email || !/^\d{10,15}$/.test(phone)) throw new ApiError("Customer email and phone are required to book this shipment.", 400);
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
    billing_email: email,
    billing_phone: phone,
    shipping_is_billing: true,
    order_items: order.products.map((item) => ({
      name: `${item.title}${item.variantLabel ? ` - ${item.variantLabel}` : ""}`,
      sku: item.variantSku || item.product?._id?.toString?.() || item.product?.toString?.() || item.title,
      units: item.quantity,
      selling_price: item.price,
    })),
    payment_method: isCod ? "COD" : "Prepaid",
    sub_total: order.subtotal,
    total_discount: order.couponDiscount || 0,
    shipping_charges: order.shippingAmount || 0,
    length: packageDetails.length,
    breadth: packageDetails.breadth,
    height: packageDetails.height,
    weight: packageDetails.weight,
  };
}

export function selectCourier(serviceability) {
  const companies = serviceability?.data?.available_courier_companies || serviceability?.available_courier_companies || [];
  if (!Array.isArray(companies) || companies.length === 0) throw new ApiError("No Shiprocket courier is serviceable for this order.", 400);
  const cost = (item) => asNumber(item.rate ?? item.freight_charge);
  const days = (item) => asNumber(item.estimated_delivery_days || item.etd_hours) || 999;
  const priced = companies.filter((item) => cost(item) > 0);
  if (!priced.length) throw new ApiError("Shiprocket did not return a valid shipping rate.", 502);
  const minimumCost = Math.min(...priced.map(cost));
  const selected = priced.filter((item) => cost(item) <= minimumCost + 10).sort((a, b) => days(a) - days(b) || cost(a) - cost(b))[0];
  const courierId = selected.courier_company_id || selected.courier_id;
  if (!courierId) throw new ApiError("Shiprocket did not return a courier id.", 502);
  return { courierId, courierName: selected.courier_name || selected.name || "Shiprocket courier", estimatedDelivery: selected.etd || selected.estimated_delivery_days, shippingCost: cost(selected) };
}

export async function getShippingRate({ deliveryPincode, weight, dimensions, paymentMethod = "prepaid", declaredValue = 0 }) {
  await assertShiprocketEnabled();
  if (!/^\d{6}$/.test(String(deliveryPincode || ""))) throw new ApiError("Enter a valid 6-digit delivery PIN code.", 400);
  if (!(Number(weight) > 0)) throw new ApiError("Shipment weight is required.", 400);
  const box = dimensions || {};
  const dimensionQuery = `&length=${positiveDimension(box.length)}&breadth=${positiveDimension(box.width ?? box.breadth)}&height=${positiveDimension(box.height)}`;
  const data = await shiprocketRequest(`/courier/serviceability/?pickup_postcode=${encodeURIComponent(env.shiprocket.pickupPostcode)}&delivery_postcode=${encodeURIComponent(deliveryPincode)}&weight=${Number(weight).toFixed(3)}${dimensionQuery}&cod=${paymentMethod === "cod" ? 1 : 0}&declared_value=${Math.max(1, Math.round(declaredValue))}`);
  return selectCourier(data);
}

function positiveDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ApiError("Shipment dimensions are required.", 400);
  // Shiprocket's serviceability API accepts dimensions as integer centimetres.
  // Round outward so decimal measurements never understate the package size.
  return encodeURIComponent(Math.ceil(number));
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

const shippingProgress = { pending: 0, shiprocket_order_created: 1, awb_assigned: 2, pickup_generated: 3, ready_for_pickup: 4, picked_up: 5, shipped: 5, in_transit: 6, out_for_delivery: 7, delivered: 8 };

export function normalizeShiprocketStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!status) return null;
  if (/\brto\b|return(ed|ing)? to origin|return initiated|return in transit/.test(status)) return "rto";
  if (/\bndr\b|undelivered|delivery failed|non delivery/.test(status)) return "ndr";
  if (/cancel(l)?ed|cancellation/.test(status)) return "cancelled";
  if (/out for delivery/.test(status)) return "out_for_delivery";
  if (/delivered/.test(status)) return "delivered";
  if (/in transit|reached at destination|reached destination|shipment further connected/.test(status)) return "in_transit";
  if (/picked up|pickup done|pickup completed/.test(status)) return "picked_up";
  if (/shipped|departed/.test(status)) return "shipped";
  if (/pickup scheduled|pickup generated|pickup queued|ready to ship|out for pickup/.test(status)) return "pickup_generated";
  if (/awb assigned/.test(status)) return "awb_assigned";
  if (/shipment created|new/.test(status)) return "shiprocket_order_created";
  if (/fail|error/.test(status)) return "failed";
  return null;
}

function providerEvent(payload = {}, source = "webhook") {
  const providerStatus = String(payload.current_status || payload.shipment_status || payload.status || payload["sr-status-label"] || payload.activity || "Unknown").trim();
  const dateValue = payload.event_time || payload.updated_at || payload.timestamp || payload.created_at || payload.date;
  const occurredAt = dateValue && !Number.isNaN(new Date(dateValue).getTime()) ? new Date(dateValue) : new Date();
  const event = {
    status: normalizeShiprocketStatus(providerStatus) || "unknown",
    providerStatus,
    providerStatusCode: String(payload.status_code || payload.sr_status || payload["sr-status"] || ""),
    location: String(payload.location || payload.current_location || "").slice(0, 300),
    description: String(payload.activity || payload.description || payload.message || providerStatus).slice(0, 1000),
    occurredAt,
    source,
  };
  event.fingerprint = crypto.createHash("sha256").update(JSON.stringify([payload.awb || payload.awb_code || "", event.providerStatus, event.providerStatusCode, event.occurredAt.toISOString(), event.location, event.description])).digest("hex");
  return event;
}

function nextShipmentStatus(current, incoming) {
  if (!incoming || incoming === "unknown") return current;
  if (current === "delivered") return "delivered";
  if (["rto", "cancelled"].includes(current)) return current;
  if (["rto", "ndr", "cancelled", "failed"].includes(incoming)) return incoming;
  if (current === "ndr") return incoming;
  return (shippingProgress[incoming] ?? -1) >= (shippingProgress[current] ?? -1) ? incoming : current;
}

async function notifyShipmentEvent(order, event) {
  if (!event.status || event.status === "unknown" || order.shipmentNotificationEvents?.includes(event.status)) return;
  const result = await sendShipmentStatusEmail(order, event.status, event);
  if (!result?.skipped) await Order.updateOne({ _id: order._id }, { $addToSet: { shipmentNotificationEvents: event.status } });
}

async function persistTrackingEvent(order, event) {
  if (order.processedTrackingEvents?.includes(event.fingerprint)) return { order, changed: false };
  const nextStatus = nextShipmentStatus(order.shippingStatus, event.status);
  const set = { lastTrackingSyncAt: new Date(), lastProviderStatus: event.providerStatus, lastProviderStatusCode: event.providerStatusCode };
  if (nextStatus !== order.shippingStatus) set.shippingStatus = nextStatus;
  if (nextStatus === "delivered") set.orderStatus = "delivered";
  const update = { $set: set, $addToSet: { processedTrackingEvents: event.fingerprint }, $push: { trackingTimeline: event } };
  const updated = await Order.findOneAndUpdate({ _id: order._id, processedTrackingEvents: { $ne: event.fingerprint } }, update, { new: true }).populate("user", "name email phone");
  if (!updated) return { order: await loadOrder(order._id), changed: false };
  updated.$locals ||= {};
  updated.$locals.webhookStatusChanged = nextStatus !== order.shippingStatus;
  await notifyShipmentEvent(updated, { ...event, status: nextStatus });
  return { order: updated, changed: true };
}

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

function responseStructure(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 2) return typeof value;
  if (Array.isArray(value)) return { type: "array", length: value.length, item: value[0] ? responseStructure(value[0], depth + 1) : undefined };
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, entry && typeof entry === "object" ? responseStructure(entry, depth + 1) : typeof entry]));
}

export function extractCreatedShipmentIdentifiers(response) {
  const candidates = [response, response?.data, response?.response, response?.response?.data].filter((value) => value && typeof value === "object");
  for (const value of candidates) {
    const shipment = Array.isArray(value.shipments) ? value.shipments[0] : value.shipment;
    const orderId = value.order_id ?? value.shiprocket_order_id ?? value.id;
    const shipmentId = value.shipment_id ?? value.shipmentId ?? shipment?.shipment_id ?? shipment?.id;
    if (orderId || shipmentId) return { orderId: orderId ? String(orderId) : "", shipmentId: shipmentId ? String(shipmentId) : "", awbCode: String(value.awb_code ?? value.awb ?? shipment?.awb_code ?? shipment?.awb ?? ""), courierName: String(value.courier_name ?? shipment?.courier_name ?? "") };
  }
  return { orderId: "", shipmentId: "", awbCode: "", courierName: "" };
}

function listedOrders(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.orders)) return response.orders;
  return [];
}

async function reconcileCreatedShipment(order) {
  let record;
  if (order.shiprocketOrderId) {
    const response = await shiprocketRequest(`/orders/show/${encodeURIComponent(order.shiprocketOrderId)}`);
    record = response?.data || response;
  } else {
    const reference = String(order._id);
    const response = await shiprocketRequest(`/orders?filter=${encodeURIComponent(reference)}&per_page=20`);
    record = listedOrders(response).find((item) => [item.channel_order_id, item.customer_order_id, item.order_id].some((value) => String(value || "") === reference));
  }
  return record ? extractCreatedShipmentIdentifiers(record) : { orderId: "", shipmentId: "", awbCode: "", courierName: "" };
}

function extractCourierName(assignResponse, fallback) {
  return assignResponse?.response?.data?.courier_name || assignResponse?.data?.courier_name || assignResponse?.courier_name || fallback;
}

function extractLabelUrl(labelResponse) {
  return labelResponse?.label_url || labelResponse?.label_url_download || labelResponse?.response?.label_url || labelResponse?.data?.label_url || "";
}

function extractManifestUrl(manifestResponse) {
  return manifestResponse?.manifest_url || manifestResponse?.manifest_url_download || manifestResponse?.response?.manifest_url || manifestResponse?.data?.manifest_url || "";
}

function extractInvoiceUrl(invoiceResponse) {
  return invoiceResponse?.invoice_url || invoiceResponse?.response?.invoice_url || invoiceResponse?.data?.invoice_url || "";
}

function trustedDocumentUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted = host === "shiprocket.in" || host.endsWith(".shiprocket.in") || host === "shiprocket.co" || host.endsWith(".shiprocket.co") || host === "amazonaws.com" || host.endsWith(".amazonaws.com");
    return url.protocol === "https:" && trusted && url.pathname.toLowerCase().endsWith(".pdf") ? url.toString() : "";
  } catch { return ""; }
}

const documentBlockedStatuses = new Set(["pending", "requires_details", "cancelled", "failed"]);
const staleOperationLock = () => new Date(Date.now() - 10 * 60 * 1000);
const providerId = (value) => Number(value) || value;

async function claimDocumentOperation(orderId, resultField, lockField, requirements = {}) {
  const order = await loadOrder(orderId);
  if (order[resultField]) return { order, existing: true };
  if (!order.shiprocketShipmentId) throw new ApiError("Shiprocket shipment ID is required.", 400);
  if (requirements.awb && !order.awbCode) throw new ApiError("AWB assignment is required before generating this document.", 400);
  if (documentBlockedStatuses.has(order.shippingStatus)) throw new ApiError("This shipment is not eligible for document generation.", 409);
  if (requirements.pickup && !order.pickupRequestedAt && !["pickup_generated", "ready_for_pickup", "picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) throw new ApiError("Request pickup before generating a manifest.", 409);
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, [resultField]: { $in: [null, ""] }, $or: [{ [lockField]: { $exists: false } }, { [lockField]: null }, { [lockField]: { $lt: staleOperationLock() } }] },
    { $set: { [lockField]: new Date() } }, { new: true },
  ).populate("user", "name email phone").populate("products.product");
  if (!claimed) throw new ApiError("Document generation is already in progress.", 409);
  return { order: claimed, existing: false };
}

async function completeDocument(order, resultField, timeField, lockField, url) {
  order[resultField] = url;
  order[timeField] = order[timeField] || new Date();
  order[lockField] = undefined;
  order.shippingFailureReason = "";
  await order.save({ validateBeforeSave: false });
  return order;
}

async function failDocument(order, lockField, error, message) {
  order[lockField] = undefined;
  order.shippingFailureReason = message;
  await order.save({ validateBeforeSave: false }).catch(() => undefined);
  if (error?.statusCode === 429) throw new ApiError("Shiprocket rate limit reached. Please retry shortly.", 429);
  throw new ApiError(message, error?.statusCode || 502);
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

async function shipmentStep(operation, message) {
  try {
    return await operation();
  } catch (error) {
    if (error?.statusCode === 429) throw new ApiError("Shiprocket rate limit reached. Please retry shortly.", 429);
    throw new ApiError(message, error?.statusCode || 502);
  }
}

export async function getShipmentTracking(orderId, user) {
  let order = await Order.findById(orderId).populate("user", "name email");
  if (!order) throw new ApiError("Order not found.", 404);
  if (user.role !== "admin" && order.user._id.toString() !== user._id.toString()) throw new ApiError("You cannot access this tracking details.", 403);
  if (order.awbCode) {
    const tracking = await shipmentStep(
      () => shiprocketRequest(`/courier/track/awb/${encodeURIComponent(order.awbCode)}`),
      "Shiprocket tracking is temporarily unavailable. Please try again.",
    );
    const trackingData = tracking?.tracking_data || tracking?.data || tracking;
    const activities = trackingData?.shipment_track_activities || trackingData?.activities || [];
    const current = Array.isArray(trackingData?.shipment_track) ? trackingData.shipment_track[0] : trackingData?.shipment_track || trackingData;
    const rawEvents = activities.length ? activities : current ? [current] : [];
    for (const rawEvent of rawEvents) {
      const result = await persistTrackingEvent(order, providerEvent({ ...rawEvent, awb: order.awbCode }, "tracking_api"));
      order = result.order;
    }
  }
  const steps = [
    ["shiprocket_order_created", "Shipment Booked"], ["awb_assigned", "AWB Assigned"], ["pickup_generated", "Pickup Requested"], ["picked_up", "Picked Up"], ["in_transit", "In Transit"], ["out_for_delivery", "Out for Delivery"], ["delivered", "Delivered"],
  ].map(([status, label]) => ({ status, label }));
  if (user.role === "admin") return { order, steps };
  const customerOrder = customerOrderView(order);
  return { order: customerOrder, steps };
}

export async function createReadyToShipShipment(orderId) {
  await assertShiprocketEnabled();
  let order = await loadOrder(orderId);
  if (order.orderStatus === "cancelled") throw new ApiError("Cancelled orders cannot be shipped.", 400);
  if (order.orderStatus === "placed") throw new ApiError("Confirm the order before preparing its shipment.", 400);
  if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid") throw new ApiError("Online payment orders must be paid before sending to Shiprocket.", 400);
  if (!/^\d{6}$/.test(String(order.shippingAddress?.postalCode || ""))) throw new ApiError("A valid 6-digit shipping PIN is required before booking.", 400);
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
    const snapshot = shipmentDataFromOrder(order);
    const packageDetails = { weight: snapshot.weight, length: snapshot.dimensions.length, breadth: snapshot.dimensions.width, height: snapshot.dimensions.height };
    const serviceability = await shipmentStep(
      () => shiprocketRequest(`/courier/serviceability/?pickup_postcode=${encodeURIComponent(env.shiprocket.pickupPostcode)}&delivery_postcode=${encodeURIComponent(order.shippingAddress.postalCode)}&weight=${packageDetails.weight}&length=${packageDetails.length}&breadth=${packageDetails.breadth}&height=${packageDetails.height}&cod=${order.paymentMethod === "cod" ? 1 : 0}&declared_value=${Math.max(1, Math.round(order.totalAmount))}`),
      "Shiprocket serviceability check failed. Verify the delivery PIN and try again.",
    );
    const courier = selectCourier(serviceability);
    if (!order.shiprocketShipmentId && (order.shiprocketOrderId || order.shipmentCreationOutcomeUnknownAt)) {
      const reconciled = await shipmentStep(
        () => reconcileCreatedShipment(order),
        "Unable to reconcile the previous Shiprocket booking. No duplicate order was created.",
      );
      order.shiprocketOrderId = reconciled.orderId || order.shiprocketOrderId;
      order.shiprocketShipmentId = reconciled.shipmentId || order.shiprocketShipmentId;
      order.awbCode = reconciled.awbCode || order.awbCode;
      order.courierName = reconciled.courierName || order.courierName;
      if (!order.shiprocketShipmentId) throw new ApiError("The previous Shiprocket booking could not be reconciled. No duplicate order was created.", 409);
      order.shippingStatus = order.awbCode ? "awb_assigned" : "shiprocket_order_created";
      order.shipmentCreationOutcomeUnknownAt = undefined;
      await order.save();
    }

    if (!order.shiprocketShipmentId) {
      let created;
      try {
        created = await shiprocketRequest("/orders/create/adhoc", { method: "POST", body: buildOrderPayload(order, packageDetails) });
      } catch (createError) {
        const reconciled = await reconcileCreatedShipment(order).catch(() => null);
        if (!reconciled?.shipmentId) {
          if ((createError?.statusCode || 500) >= 500) {
            order.shipmentCreationOutcomeUnknownAt = new Date();
            await order.save();
            throw new ApiError("Shiprocket order creation failed. Its outcome could not be confirmed; retry will reconcile before creating another order.", createError?.statusCode || 502);
          }
          throw new ApiError("Shiprocket order creation failed. No shipment was booked.", createError?.statusCode || 400);
        }
        created = reconciled;
      }
      const identifiers = created.orderId !== undefined ? created : extractCreatedShipmentIdentifiers(created);
      const providerStatusCode = Number(created?.status_code ?? created?.data?.status_code ?? 0);
      if (!identifiers.orderId && !identifiers.shipmentId && (providerStatusCode >= 400 || created?.errors || created?.error)) throw new ApiError("Shiprocket order creation failed. No shipment was booked.", 400);
      order.shiprocketOrderId = identifiers.orderId || order.shiprocketOrderId;
      order.shiprocketShipmentId = identifiers.shipmentId || order.shiprocketShipmentId;
      order.awbCode = identifiers.awbCode || order.awbCode;
      order.courierName = identifiers.courierName || order.courierName;
      order.shippingStatus = "shiprocket_order_created";
      recordStatus(order, "shiprocket_order_created");
      await order.save();
      if (!order.shiprocketShipmentId) {
        order.shipmentCreationOutcomeUnknownAt = new Date();
        await order.save();
        logExternalFailure("shiprocket", new Error("Create order response did not include a shipment identifier."), { action: "create_order_response", responseStructure: responseStructure(created), shiprocketOrderIdPersisted: Boolean(order.shiprocketOrderId) });
        const reconciled = await reconcileCreatedShipment(order).catch(() => null);
        order.shiprocketOrderId = reconciled?.orderId || order.shiprocketOrderId;
        order.shiprocketShipmentId = reconciled?.shipmentId || order.shiprocketShipmentId;
        if (order.shiprocketShipmentId) {
          order.shipmentCreationOutcomeUnknownAt = undefined;
          await order.save();
        }
      }
    }

    if (!order.shiprocketShipmentId) throw new ApiError("Shiprocket did not return a shipment id.", 502);

    if (order.awbCode) {
      order.shippingStatus = "awb_assigned";
      order.shipmentBookedAt = order.shipmentBookedAt || new Date();
      order.shipmentCreationStartedAt = undefined;
      order.shipmentCreationOutcomeUnknownAt = undefined;
      await order.save();
      await sendShipmentEmailOnce(order);
      return order;
    }

    const assigned = await shipmentStep(
      () => shiprocketRequest("/courier/assign/awb", { method: "POST", body: { shipment_id: order.shiprocketShipmentId, courier_id: courier.courierId } }),
      "Shiprocket AWB assignment failed. The shipment ID was saved; retry booking to continue.",
    );
    const awbCode = extractAwb(assigned);
    if (!awbCode) throw new ApiError("Shiprocket did not return an AWB code.", 502);

    order.awbCode = awbCode;
    order.selectedCourierId = courier.courierId;
    order.courierName = extractCourierName(assigned, courier.courierName);
    order.trackingUrl = getTrackingUrl(awbCode);
    order.estimatedDelivery = parseEstimatedDelivery(courier.estimatedDelivery) || order.estimatedDelivery;
    order.shippingStatus = "awb_assigned";
    order.shipmentBookedAt = order.shipmentBookedAt || new Date();
    recordStatus(order, "awb_assigned");
    order.shippingFailureReason = "";
    order.shipmentCreationStartedAt = undefined;
    order.shipmentCreationOutcomeUnknownAt = undefined;
    await order.save();
    await sendShipmentEmailOnce(order);
    return order;
  } catch (error) {
    order.shipmentCreationStartedAt = undefined;
    const status = /weight|dimensions|configuration/i.test(error.message || "") ? "requires_details" : "failed";
    return failShipment(order, error, status);
  }
}

export async function requestShipmentPickup(orderId) {
  await assertShiprocketEnabled();
  let order = await loadOrder(orderId);
  if (order.orderStatus === "cancelled" || order.shippingStatus === "cancelled") throw new ApiError("Cancelled orders cannot request pickup.", 400);
  if (!order.shiprocketShipmentId || !order.awbCode) throw new ApiError("Book the shipment and assign an AWB before requesting pickup.", 400);
  if (order.pickupRequestedAt || ["pickup_generated", "ready_for_pickup", "picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) return order;

  const attemptAt = new Date();
  const staleLock = new Date(attemptAt.getTime() - 10 * 60 * 1000);
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, awbCode: { $nin: [null, ""] }, shiprocketShipmentId: { $nin: [null, ""] }, pickupRequestedAt: { $in: [null] }, $or: [{ pickupRequestStartedAt: { $exists: false } }, { pickupRequestStartedAt: null }, { pickupRequestStartedAt: { $lt: staleLock } }] },
    { $set: { pickupRequestStartedAt: attemptAt } },
    { new: true },
  ).populate("user", "name email phone").populate("products.product");
  if (!claimed) {
    order = await loadOrder(orderId);
    if (order.pickupRequestedAt) return order;
    throw new ApiError("Pickup request is already in progress for this shipment.", 409);
  }
  order = claimed;

  try {
    const pickup = await shiprocketRequest("/courier/generate/pickup", { method: "POST", body: { shipment_id: [order.shiprocketShipmentId] } });
    order.pickupStatus = pickup?.response?.pickup_status || pickup?.pickup_status || pickup?.message || "Pickup requested";
    order.pickupRequestedAt = new Date();
    order.pickupRequestStartedAt = undefined;
    order.shippingStatus = "pickup_generated";
    order.readyToShipAt = order.readyToShipAt || new Date();
    if (order.orderStatus === "confirmed") order.orderStatus = "packed";
    recordStatus(order, "pickup_generated");
    order.shippingFailureReason = "";
    await order.save();
    return order;
  } catch (error) {
    order.pickupRequestStartedAt = undefined;
    order.shippingFailureReason = "Unable to request Shiprocket pickup. Please retry.";
    await order.save();
    throw error;
  }
}

export async function markShipmentHandedOver(orderId) {
  const order = await loadOrder(orderId);
  if (["picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) return order;
  if (order.orderStatus === "cancelled" || order.shippingStatus === "cancelled") throw new ApiError("Cancelled orders cannot be handed over.", 400);
  if (!["pickup_generated", "ready_for_pickup"].includes(order.shippingStatus) || !order.awbCode) throw new ApiError("Pickup must be requested before handover.", 400);
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
  const received = headers["x-api-key"];
  if (!secretsMatch(received, expected)) throw new ApiError("Invalid Shiprocket webhook token.", 401);

  const awbCode = payload.awb || payload.awb_code || payload.awbCode;
  const shipmentId = payload.shipment_id || payload.shipmentId;
  const shiprocketOrderId = payload.order_id || payload.sr_order_id || payload.shiprocket_order_id;
  if (!awbCode && !shipmentId && !shiprocketOrderId) throw new ApiError("Shiprocket webhook shipment identifier is required.", 400);
  const query = awbCode ? { awbCode } : shipmentId ? { shiprocketShipmentId: String(shipmentId) } : { shiprocketOrderId: String(shiprocketOrderId || "") };
  const order = await Order.findOne(query);
  if (!order) throw new ApiError("Order not found for Shiprocket webhook.", 404);
  const event = providerEvent(payload, "webhook");
  const result = await persistTrackingEvent(order, event);
  result.order.trackingUrl = trustedTrackingUrl(payload.tracking_url) || result.order.trackingUrl || getTrackingUrl(result.order.awbCode);
  if (result.changed) await result.order.save({ validateBeforeSave: false });
  return result.order;
}

export async function cancelShiprocketShipment(orderId) {
  await assertShiprocketEnabled();
  const order = await loadOrder(orderId);
  if (!order.shiprocketOrderId) throw new ApiError("This order has no Shiprocket shipment to cancel.", 400);
  if (["picked_up", "shipped", "in_transit", "out_for_delivery", "delivered", "ndr", "rto"].includes(order.shippingStatus)) throw new ApiError("Shiprocket does not allow cancellation after courier pickup.", 409);
  if (order.shippingStatus === "cancelled" || order.shipmentCancelledAt) return order;
  await shipmentStep(
    () => shiprocketRequest("/orders/cancel", { method: "POST", body: { ids: [Number(order.shiprocketOrderId) || order.shiprocketOrderId] } }),
    "Shiprocket shipment cancellation failed. The shipment remains active.",
  );
  order.shippingStatus = "cancelled";
  order.shipmentCancellationStatus = "cancelled";
  order.shipmentCancelledAt = new Date();
  const event = providerEvent({ awb: order.awbCode, status: "cancelled", event_time: order.shipmentCancelledAt, activity: "Shipment cancelled" }, "tracking_api");
  if (!order.processedTrackingEvents?.includes(event.fingerprint)) {
    order.processedTrackingEvents = [...(order.processedTrackingEvents || []), event.fingerprint];
    order.trackingTimeline = [...(order.trackingTimeline || []), event];
  }
  await order.save();
  await notifyShipmentEvent(order, event);
  return order;
}

export async function generateShipmentLabel(orderId) {
  await assertShiprocketEnabled();
  const { order, existing } = await claimDocumentOperation(orderId, "labelUrl", "labelGenerationStartedAt", { awb: true });
  if (existing) return order;
  try {
    const response = await shiprocketRequest("/courier/generate/label", { method: "POST", body: { shipment_id: [providerId(order.shiprocketShipmentId)] } });
    const url = trustedDocumentUrl(extractLabelUrl(response));
    if (!url || response?.label_created === 0) throw new ApiError("Shiprocket did not generate a valid shipment label.", 502);
    return completeDocument(order, "labelUrl", "labelGeneratedAt", "labelGenerationStartedAt", url);
  } catch (error) { return failDocument(order, "labelGenerationStartedAt", error, "Unable to generate the shipment label. Please retry."); }
}

async function loadManifestOrders(orderIds) {
  const ids = [...new Set(orderIds.map(String))];
  if (!ids.length || ids.length > 50 || ids.some((id) => !/^[a-f\d]{24}$/i.test(id))) throw new ApiError("Select between 1 and 50 valid shipments.", 400);
  const orders = await Order.find({ _id: { $in: ids } });
  if (orders.length !== ids.length) throw new ApiError("One or more selected orders were not found.", 404);
  for (const order of orders) {
    if (!order.shiprocketShipmentId || !order.shiprocketOrderId || !order.awbCode) throw new ApiError("Every selected order must have a Shiprocket shipment and AWB.", 400);
    if (documentBlockedStatuses.has(order.shippingStatus)) throw new ApiError("Cancelled, failed, or unbooked shipments cannot be added to a manifest.", 409);
    if (!order.pickupRequestedAt && !["pickup_generated", "ready_for_pickup", "picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) throw new ApiError("Request pickup for every shipment before generating a manifest.", 409);
  }
  return orders;
}

export async function generateShipmentManifest(orderIds = []) {
  await assertShiprocketEnabled();
  const orders = await loadManifestOrders(orderIds);
  const existingUrls = [...new Set(orders.map((order) => order.manifestUrl).filter(Boolean))];
  if (orders.every((order) => order.manifestUrl) && existingUrls.length === 1) return { orders, url: existingUrls[0], existing: true };
  const pending = orders.filter((order) => !order.manifestUrl);
  const lockAt = new Date();
  const locked = await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestUrl: { $in: [null, ""] }, $or: [{ manifestGenerationStartedAt: { $exists: false } }, { manifestGenerationStartedAt: null }, { manifestGenerationStartedAt: { $lt: staleOperationLock() } }] }, { $set: { manifestGenerationStartedAt: lockAt } });
  if (locked.modifiedCount !== pending.length) {
    await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestGenerationStartedAt: lockAt }, { $unset: { manifestGenerationStartedAt: 1 } });
    throw new ApiError("Manifest generation is already in progress.", 409);
  }
  try {
    const response = await shiprocketRequest("/manifests/generate", { method: "POST", body: { shipment_id: pending.map((order) => providerId(order.shiprocketShipmentId)) } });
    const url = trustedDocumentUrl(extractManifestUrl(response));
    if (!url || response?.status === 0) throw new ApiError("Shiprocket did not generate a valid manifest.", 502);
    const now = new Date();
    await Order.updateMany({ _id: { $in: pending.map((order) => order._id) } }, { $set: { manifestUrl: url, manifestGeneratedAt: now, shippingFailureReason: "" }, $unset: { manifestGenerationStartedAt: 1 } });
    pending.forEach((order) => { order.manifestUrl = url; order.manifestGeneratedAt = now; order.manifestGenerationStartedAt = undefined; });
    return { orders, url, existing: false };
  } catch (error) {
    await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestGenerationStartedAt: lockAt }, { $unset: { manifestGenerationStartedAt: 1 } }).catch(() => undefined);
    if (error?.statusCode === 429) throw new ApiError("Shiprocket rate limit reached. Please retry shortly.", 429);
    throw new ApiError("Unable to generate the shipment manifest. Please retry.", error?.statusCode || 502);
  }
}

export async function printShipmentManifest(orderIds = []) {
  await assertShiprocketEnabled();
  const orders = await loadManifestOrders(orderIds);
  if (orders.some((order) => !order.manifestUrl)) throw new ApiError("Generate the manifest before printing it.", 409);
  const existingUrls = [...new Set(orders.map((order) => order.manifestPrintUrl).filter(Boolean))];
  if (orders.every((order) => order.manifestPrintUrl) && existingUrls.length === 1) return { orders, url: existingUrls[0], existing: true };
  const pending = orders.filter((order) => !order.manifestPrintUrl);
  const lockAt = new Date();
  const locked = await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestPrintUrl: { $in: [null, ""] }, $or: [{ manifestPrintStartedAt: { $exists: false } }, { manifestPrintStartedAt: null }, { manifestPrintStartedAt: { $lt: staleOperationLock() } }] }, { $set: { manifestPrintStartedAt: lockAt } });
  if (locked.modifiedCount !== pending.length) {
    await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestPrintStartedAt: lockAt }, { $unset: { manifestPrintStartedAt: 1 } });
    throw new ApiError("Manifest printing is already in progress.", 409);
  }
  try {
    const response = await shiprocketRequest("/manifests/print", { method: "POST", body: { order_ids: orders.map((order) => providerId(order.shiprocketOrderId)) } });
    const url = trustedDocumentUrl(extractManifestUrl(response));
    if (!url) throw new ApiError("Shiprocket did not return a valid printable manifest.", 502);
    const now = new Date();
    await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestPrintStartedAt: lockAt }, { $set: { manifestPrintUrl: url, manifestPrintedAt: now }, $unset: { manifestPrintStartedAt: 1 } });
    pending.forEach((order) => { order.manifestPrintUrl = url; order.manifestPrintedAt = now; order.manifestPrintStartedAt = undefined; });
    return { orders, url, existing: false };
  } catch (error) {
    await Order.updateMany({ _id: { $in: pending.map((order) => order._id) }, manifestPrintStartedAt: lockAt }, { $unset: { manifestPrintStartedAt: 1 } }).catch(() => undefined);
    if (error?.statusCode === 429) throw new ApiError("Shiprocket rate limit reached. Please retry shortly.", 429);
    throw new ApiError("Unable to prepare the printable manifest. Please retry.", error?.statusCode || 502);
  }
}

export async function generateShipmentInvoice(orderId) {
  await assertShiprocketEnabled();
  const { order, existing } = await claimDocumentOperation(orderId, "shiprocketInvoiceUrl", "shiprocketInvoiceGenerationStartedAt");
  if (existing) return order;
  if (!order.shiprocketOrderId) return failDocument(order, "shiprocketInvoiceGenerationStartedAt", new ApiError("Shiprocket order ID is required.", 400), "Shiprocket order ID is required.");
  try {
    const response = await shiprocketRequest("/orders/print/invoice", { method: "POST", body: { ids: [providerId(order.shiprocketOrderId)] } });
    const url = trustedDocumentUrl(extractInvoiceUrl(response));
    if (!url || response?.is_invoice_created === false) throw new ApiError("Shiprocket did not generate a valid shipment invoice.", 502);
    return completeDocument(order, "shiprocketInvoiceUrl", "shiprocketInvoiceGeneratedAt", "shiprocketInvoiceGenerationStartedAt", url);
  } catch (error) { return failDocument(order, "shiprocketInvoiceGenerationStartedAt", error, "Unable to generate the Shiprocket invoice. Please retry."); }
}

export function getShipmentDocument(order, type) {
  const fields = { label: "labelUrl", manifest: "manifestPrintUrl", invoice: "shiprocketInvoiceUrl" };
  const field = fields[type];
  if (!field) throw new ApiError("Unknown shipment document type.", 400);
  const url = trustedDocumentUrl(order?.[field]);
  if (!url) throw new ApiError("Shipment document is not available.", 404);
  return url;
}



