import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import ExcelJS from "exceljs";
import Order from "../models/Order.js";
import { createManualAttentionWorkbook, listFulfillmentOrders } from "../services/fulfillmentService.js";

const originalFind = Order.find;
const originalCount = Order.countDocuments;

afterEach(() => { Order.find = originalFind; Order.countDocuments = originalCount; });

function queryResult(items) {
  return { populate() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => items, then(resolve) { return Promise.resolve(resolve(items)); } };
}

test("fulfillment queue is restricted to controlled fulfillment states", async () => {
  const items = [{ _id: "order-1", orderStatus: "confirmed" }];
  Order.find = (filter) => { assert.deepEqual(filter.orderStatus.$in, ["confirmed", "packed", "shipped"]); return queryResult(items); };
  Order.countDocuments = async () => 1;
  const result = await listFulfillmentOrders({ sort: "newest" });
  assert.equal(result.items.length, 1);
});

test("manual-attention XLSX contains only requested operational columns and typed values", async () => {
  const order = { _id: "64b000000000000000000040", createdAt: new Date("2026-09-02T10:00:00Z"), confirmedAt: new Date("2026-09-03T10:00:00Z"), user: { name: "Customer", email: "customer@example.com" }, shippingAddress: { phone: "9999999999", street: "Road", city: "Tumakuru", state: "Karnataka", postalCode: "572106", country: "India" }, products: [{ title: "Groundnut Oil", quantity: 2 }], totalAmount: 500, paymentStatus: "paid", orderStatus: "confirmed", shippingStatus: "failed", shippingFailureReason: "Courier unavailable" };
  Order.find = (filter) => { assert.deepEqual(filter.shippingStatus.$in, ["failed", "requires_details"]); return queryResult([order]); };
  const buffer = await createManualAttentionWorkbook();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Shipment Attention");
  assert.equal(sheet.getRow(1).getCell(1).value, "Order ID");
  assert.equal(sheet.getRow(2).getCell(8).value, "Groundnut Oil");
  assert.equal(sheet.getRow(2).getCell(9).value, 2);
  assert.equal(sheet.getRow(2).getCell(10).value, 500);
  assert.equal(sheet.columnCount, 15);
});
