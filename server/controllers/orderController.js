// Order controller exposes customer and admin order operations.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { createOrder, getAllOrders, getMyOrders, getOrderForUser, updateOrderStatus } from "../services/orderService.js";
import { createReadyToShipShipment, getShipmentTracking, syncShiprocketWebhook } from "../services/shiprocketService.js";
import { writeAuditLog } from "../admin/utils/audit.js";
import { getCheckoutShippingQuote } from "../services/paymentService.js";
import { createInvoicePdfBuffer, invoiceNumberFor } from "../services/invoiceService.js";

export const getShippingQuoteHandler = asyncHandler(async (req, res) => sendSuccess(res, 200, "Shipping calculated successfully", { quote: await getCheckoutShippingQuote(req.user._id, req.body) }));

export const createOrderHandler = asyncHandler(async (req, res) => {
  const order = await createOrder(req.user._id, req.body);
  sendSuccess(res, 201, "Order created successfully", { order });
});

export const getMyOrdersHandler = asyncHandler(async (req, res) => {
  const orders = await getMyOrders(req.user._id);
  sendSuccess(res, 200, "Orders fetched successfully", { orders });
});

export const getOrderHandler = asyncHandler(async (req, res) => {
  const order = await getOrderForUser(req.params.id, req.user);
  sendSuccess(res, 200, "Order fetched successfully", { order });
});

export const getOrderInvoiceHandler = asyncHandler(async (req, res) => {
  const order = await getOrderForUser(req.params.id, req.user);
  const pdf = await createInvoicePdfBuffer(order);
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Invoice-${invoiceNumberFor(order)}.pdf"`, "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" });
  res.send(pdf);
});

export const getAllOrdersHandler = asyncHandler(async (_req, res) => {
  const orders = await getAllOrders();
  sendSuccess(res, 200, "Orders fetched successfully", { orders });
});

export const updateOrderStatusHandler = asyncHandler(async (req, res) => {
  const order = await updateOrderStatus(req.params.id, req.body);
  sendSuccess(res, 200, "Order status updated successfully", { order });
});

export const readyToShipHandler = asyncHandler(async (req, res) => {
  const order = await createReadyToShipShipment(req.params.id);
  sendSuccess(res, 200, "Shiprocket shipment prepared successfully", { order });
});

export const shiprocketWebhookHandler = asyncHandler(async (req, res) => {
  const order = await syncShiprocketWebhook(req.body, req.headers);
  if (order.$locals?.webhookStatusChanged) await writeAuditLog(req, { action: order.shippingStatus === "delivered" ? "shipping.delivered" : "shipping.status_received", resourceType: "Order", resourceId: order._id, summary: `Shiprocket status updated to ${order.shippingStatus}`, after: { shippingStatus: order.shippingStatus, shiprocketShipmentId: order.shiprocketShipmentId, awbCode: order.awbCode } }).catch(() => undefined);
  sendSuccess(res, 200, "Shiprocket status synchronized", { orderId: order._id, shippingStatus: order.shippingStatus });
});

export const getOrderTrackingHandler = asyncHandler(async (req, res) => {
  const tracking = await getShipmentTracking(req.params.id, req.user);
  sendSuccess(res, 200, "Tracking fetched successfully", tracking);
});
