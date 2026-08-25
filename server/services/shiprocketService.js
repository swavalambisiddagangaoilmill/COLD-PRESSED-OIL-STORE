// Shiprocket delivery integration and shipment status synchronization.
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import { ApiError } from "../utils/ApiError.js";
import { logExternalFailure } from "./serviceStatusService.js";

const API_BASE = "https://apiv2.shiprocket.in/v1/external";
const MOCK_STEPS = [
  { status: "ready_for_pickup", label: "Ready to Ship" },
  { status: "picked_up", label: "Picked Up" },
  { status: "shipped", label: "Shipped" },
  { status: "in_transit", label: "In Transit" },
  { status: "out_for_delivery", label: "Out for Delivery" },
  { status: "delivered", label: "Delivered" },
];
let authCache = { token: "", expiresAt: 0 };

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
    throw new ApiError(response.status >= 500 ? "Shipping integration is temporarily unavailable." : message, response.status >= 500 ? 502 : response.status, data.errors || []);
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
      name: `${item.title} - ${item.variantName || ""}`.trim(),
      sku: item.sku || item.product?._id?.toString?.() || item.product?.toString?.() || item.title,
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

function selectCourier(serviceability) {
  const companies = serviceability?.data?.available_courier_companies || serviceability?.available_courier_companies || [];
  if (!Array.isArray(companies) || companies.length === 0) throw new ApiError("No Shiprocket courier is serviceable for this order.", 400);
  const sorted = [...companies].sort((a, b) => {
    const aSurface = /surface/i.test(`${a.mode || a.courier_name || ""}`) || a.is_surface === true;
    const bSurface = /surface/i.test(`${b.mode || b.courier_name || ""}`) || b.is_surface === true;
    if (aSurface !== bSurface) return aSurface ? -1 : 1;
    return asNumber(a.freight_charge || a.rate) - asNumber(b.freight_charge || b.rate);
  });
  const selected = sorted[0];
  const courierId = selected.courier_company_id || selected.courier_id;
  if (!courierId) throw new ApiError("Shiprocket did not return a courier id.", 502);
  return { courierId, courierName: selected.courier_name || selected.name || "Shiprocket courier", estimatedDelivery: selected.etd || selected.estimated_delivery_days };
}

function getTrackingUrl(awbCode) {
  return awbCode ? `https://shiprocket.co/tracking/${awbCode}` : "";
}

function getMockTrackingUrl(orderId) {
  return `/track/${orderId}`;
}

function createMockAwb() {
  return `MOCK-AWB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
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
  order.shippingFailureReason = error.message || "Shiprocket shipment failed.";
  await order.save();
  throw error;
}

function applyMockStep(order, stepIndex) {
  const safeIndex = Math.min(Math.max(stepIndex, 0), MOCK_STEPS.length - 1);
  const step = MOCK_STEPS[safeIndex];
  order.mockShippingStep = safeIndex;
  order.shippingStatus = step.status;
  order.pickupStatus = safeIndex >= 1 ? "Pickup completed" : "Pickup requested";
  order.orderStatus = step.status === "delivered" ? "delivered" : ["shipped", "in_transit", "out_for_delivery"].includes(step.status) ? "shipped" : "packed";
  order.mockShippingHistory = [...(order.mockShippingHistory || []), { status: step.status, label: step.label, createdAt: new Date() }];
}

async function createMockReadyToShipShipment(order) {
  if (order.awbCode && order.isMockShipment) return order;
  order.isMockShipment = true;
  order.shiprocketOrderId = order.shiprocketOrderId || `MOCK-SR-${order._id}`;
  order.shiprocketShipmentId = order.shiprocketShipmentId || `MOCK-SHIP-${order._id}`;
  order.awbCode = order.awbCode || createMockAwb();
  order.courierName = "Swavalambi Siddaganga Oil Mill Test Courier";
  order.trackingUrl = getMockTrackingUrl(order._id);
  order.labelUrl = getMockTrackingUrl(order._id);
  order.manifestUrl = getMockTrackingUrl(order._id);
  order.readyToShipAt = new Date();
  order.shippingFailureReason = "";
  order.mockShippingHistory = [];
  applyMockStep(order, 0);
  await order.save();
  return order;
}

export async function advanceMockShipment(orderId) {
  if (!env.shiprocket.mock) throw new ApiError("Mock Shiprocket mode is disabled.", 400);
  const order = await loadOrder(orderId);
  if (!order.isMockShipment) throw new ApiError("This order is not using mock shipment tracking.", 400);
  applyMockStep(order, (order.mockShippingStep || 0) + 1);
  await order.save();
  return order;
}

export async function getShipmentTracking(orderId, user) {
  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) throw new ApiError("Order not found.", 404);
  if (user.role !== "admin" && order.user._id.toString() !== user._id.toString()) throw new ApiError("You cannot access this tracking details.", 403);
  return { order, steps: order.isMockShipment ? MOCK_STEPS : [] };
}

export async function createReadyToShipShipment(orderId) {
  const order = await loadOrder(orderId);
  if (order.orderStatus === "cancelled") throw new ApiError("Cancelled orders cannot be shipped.", 400);
  if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid") throw new ApiError("Online payment orders must be paid before sending to Shiprocket.", 400);
  if (env.shiprocket.mock) return createMockReadyToShipShipment(order);
  if (order.awbCode) return order;

  try {
    const packageDetails = getPackageDetails(order);
    if (!order.shiprocketShipmentId) {
      const created = await shiprocketRequest("/orders/create/adhoc", { method: "POST", body: buildOrderPayload(order, packageDetails) });
      order.shiprocketOrderId = created.order_id || created.shiprocket_order_id || created.data?.order_id || order.shiprocketOrderId;
      order.shiprocketShipmentId = created.shipment_id || created.data?.shipment_id || order.shiprocketShipmentId;
      order.shippingStatus = "shiprocket_order_created";
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
    order.shippingStatus = "awb_assigned";
    if (["placed", "confirmed"].includes(order.orderStatus)) order.orderStatus = "packed";
    await order.save();

    const pickup = await shiprocketRequest("/courier/generate/pickup", { method: "POST", body: { shipment_id: [order.shiprocketShipmentId] } });
    order.pickupStatus = pickup?.pickup_status || pickup?.message || "Pickup requested";
    order.shippingStatus = "pickup_generated";
    await order.save();

    const label = await shiprocketRequest("/courier/generate/label", { method: "POST", body: { shipment_id: [order.shiprocketShipmentId] } });
    order.labelUrl = extractLabelUrl(label) || order.labelUrl;
    order.shippingStatus = "label_generated";
    await order.save();

    const manifest = await shiprocketRequest("/manifests/generate", { method: "POST", body: { shipment_id: [order.shiprocketShipmentId] } });
    order.manifestUrl = extractManifestUrl(manifest) || order.manifestUrl;
    order.shippingStatus = "ready_for_pickup";
    order.readyToShipAt = new Date();
    order.shippingFailureReason = "";
    await order.save();
    return order;
  } catch (error) {
    const status = /weight|dimensions|configuration/i.test(error.message || "") ? "requires_details" : "failed";
    return failShipment(order, error, status);
  }
}

export async function markShipmentHandedOver(orderId) {
  const order = await loadOrder(orderId);
  if (["picked_up", "shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.shippingStatus)) return order;
  if (order.orderStatus === "cancelled" || order.shippingStatus === "cancelled") throw new ApiError("Cancelled orders cannot be handed over.", 400);
  if (order.shippingStatus !== "ready_for_pickup" || !order.awbCode) throw new ApiError("The shipment must be ready with an AWB before handover.", 400);
  if (order.isMockShipment) applyMockStep(order, 1);
  else {
    order.shippingStatus = "picked_up";
    order.orderStatus = "shipped";
  }
  order.pickupStatus = "Handed over to Shiprocket";
  order.handedOverAt = order.handedOverAt || new Date();
  await order.save();
  return order;
}

export async function syncShiprocketWebhook(payload, headers = {}) {
  const expected = env.shiprocket.webhookSecret;
  if (!expected) throw new ApiError("Shiprocket webhook secret is not configured.", 503);
  const received = headers["x-shiprocket-token"] || headers["x-webhook-token"] || headers["x-shiprocket-signature"];
  if (received !== expected) throw new ApiError("Invalid Shiprocket webhook token.", 401);

  const awbCode = payload.awb || payload.awb_code || payload.awbCode;
  const shipmentId = payload.shipment_id || payload.shipmentId;
  const shiprocketOrderId = payload.order_id || payload.sr_order_id || payload.shiprocket_order_id;
  const query = awbCode ? { awbCode } : shipmentId ? { shiprocketShipmentId: String(shipmentId) } : { shiprocketOrderId: String(shiprocketOrderId || "") };
  const order = await Order.findOne(query);
  if (!order) throw new ApiError("Order not found for Shiprocket webhook.", 404);

  const rawStatus = String(payload.current_status || payload.shipment_status || payload.status || "").toLowerCase();
  const normalized = rawStatus.includes("delivered") ? "delivered"
    : rawStatus.includes("out for delivery") ? "out_for_delivery"
    : rawStatus.includes("cancel") ? "cancelled"
    : rawStatus.includes("rto") ? "rto"
    : rawStatus.includes("ship") || rawStatus.includes("transit") ? "shipped"
    : order.shippingStatus;

  if (order.orderStatus === "cancelled" && normalized !== "cancelled") return order;

  order.shippingStatus = normalized;
  if (normalized === "delivered") order.orderStatus = "delivered";
  if (["shipped", "out_for_delivery"].includes(normalized) && order.orderStatus !== "delivered") order.orderStatus = "shipped";
  if (normalized === "cancelled") order.orderStatus = "cancelled";
  order.trackingUrl = payload.tracking_url || order.trackingUrl || getTrackingUrl(order.awbCode);
  await order.save();
  return order;
}



