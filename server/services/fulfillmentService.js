// Admin fulfillment orchestration and manual-attention XLSX export.
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { ApiError } from "../utils/ApiError.js";
import { createReadyToShipShipment } from "./shiprocketService.js";

const attentionStatuses = ["failed", "requires_details"];

function customerName(order) {
  return order.user?.name || order.shippingAddress?.fullName || "Customer";
}

function failureMessage(error) {
  const message = String(error?.message || "");
  if (/address|weight|dimension|payment|confirm|already in progress/i.test(message)) return message;
  return "Unable to create shipment for this order. Please retry.";
}

export async function listFulfillmentOrders(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const filter = { orderStatus: { $in: ["confirmed", "packed", "shipped"] } };
  if (query.status && query.status !== "all") filter.shippingStatus = query.status;
  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      ...(mongoose.isValidObjectId(search) ? [{ _id: search }] : []),
      { "shippingAddress.fullName": new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
    ];
  }
  const sort = query.sort === "oldest" ? { confirmedAt: 1, createdAt: 1 } : { confirmedAt: -1, createdAt: -1 };
  const [items, total] = await Promise.all([
    Order.find(filter).populate("user", "name email phone").sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function submitFulfillmentBatch(orderIds = []) {
  const ids = [...new Set(orderIds.map(String))];
  if (!ids.length) throw new ApiError("Select at least one confirmed order.", 400);
  if (ids.length > 50) throw new ApiError("A maximum of 50 orders can be processed at once.", 400);

  const results = [];
  for (const orderId of ids) {
    try {
      const order = await createReadyToShipShipment(orderId);
      results.push({ orderId, customer: customerName(order), success: true, alreadySubmitted: Boolean(order.awbCode && order.shipmentAttemptCount === 0), order });
    } catch (error) {
      const failedOrder = await Order.findById(orderId).populate("user", "name").catch(() => null);
      results.push({ orderId, customer: failedOrder ? customerName(failedOrder) : "Customer", success: false, reason: failureMessage(error), retryEligible: !/cancelled|delivered|must be paid/i.test(String(error?.message || "")) });
    }
  }
  const succeeded = results.filter((item) => item.success);
  const failed = results.filter((item) => !item.success);
  return { selected: ids.length, succeeded: succeeded.length, failed: failed.length, results };
}

function addressLine(order) {
  const address = order.shippingAddress || {};
  return [address.street, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ");
}

export async function createManualAttentionWorkbook() {
  const orders = await Order.find({ orderStatus: { $in: ["confirmed", "packed"] }, shippingStatus: { $in: attentionStatuses } }).populate("user", "name email phone").sort({ confirmedAt: 1, createdAt: 1 }).lean();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Swavalambi Siddaganga Oil Mill";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Shipment Attention", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  sheet.columns = [
    ["Order ID", "orderId", 26], ["Order Date", "orderDate", 20], ["Confirmation Date", "confirmationDate", 20], ["Customer Name", "customerName", 24], ["Customer Phone", "phone", 16], ["Customer Email", "email", 28], ["Shipping Address", "address", 42], ["Product", "product", 28], ["Quantity", "quantity", 10], ["Order Total", "total", 14], ["Payment Status", "payment", 16], ["Fulfillment Status", "fulfillment", 18], ["Shiprocket Status", "shipping", 18], ["Shipment/AWB", "awb", 20], ["Failure Reason", "failure", 38],
  ].map(([header, key, width]) => ({ header, key, width }));
  for (const order of orders) {
    const products = Array.isArray(order.products) && order.products.length ? order.products : [{ title: "-", quantity: 0 }];
    for (const product of products) sheet.addRow({ orderId: String(order._id), orderDate: order.createdAt, confirmationDate: order.confirmedAt || null, customerName: customerName(order), phone: order.shippingAddress?.phone || order.user?.phone || "", email: order.user?.email || "", address: addressLine(order), product: product.title || "Product", quantity: Number(product.quantity) || 0, total: Number(order.totalAmount) || 0, payment: order.paymentStatus, fulfillment: order.orderStatus, shipping: order.shippingStatus, awb: order.awbCode || "", failure: order.shippingFailureReason || "Shipment requires manual attention." });
  }
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF214F3B" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  sheet.autoFilter = { from: "A1", to: "O1" };
  sheet.getColumn("orderDate").numFmt = "dd mmm yyyy, hh:mm";
  sheet.getColumn("confirmationDate").numFmt = "dd mmm yyyy, hh:mm";
  sheet.getColumn("total").numFmt = '₹#,##0.00';
  sheet.getColumn("quantity").alignment = { horizontal: "center" };
  sheet.eachRow((row, index) => { if (index > 1) { row.alignment = { vertical: "top", wrapText: true }; row.height = 34; if (index % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF6EF" } }; } });
  return workbook.xlsx.writeBuffer();
}
