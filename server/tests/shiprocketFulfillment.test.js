import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import StoreSettings from "../models/StoreSettings.js";
import { generateShipmentInvoice, generateShipmentLabel, generateShipmentManifest, getShipmentDocument, printShipmentManifest, resetShiprocketAuthForTests } from "../services/shiprocketService.js";

const originals = { findById: Order.findById, findOneAndUpdate: Order.findOneAndUpdate, find: Order.find, updateMany: Order.updateMany, settings: StoreSettings.findOne, fetch: globalThis.fetch, config: { ...env.shiprocket } };
const query = (value) => ({ populate() { return this; }, then(resolve) { return Promise.resolve(resolve(value)); } });
const order = (id = "64b000000000000000000020") => ({ _id: id, shiprocketOrderId: "1001", shiprocketShipmentId: "2001", awbCode: "AWB1", shippingStatus: "pickup_generated", pickupRequestedAt: new Date(), productSubtotal: 500, offerDiscount: 50, couponDiscount: 25, shippingAmount: 100, totalAmount: 525, async save() { return this; } });

beforeEach(() => {
  resetShiprocketAuthForTests();
  Object.assign(env.shiprocket, { enabled: true, email: "api@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) });
});

afterEach(() => {
  resetShiprocketAuthForTests(); Object.assign(env.shiprocket, originals.config); StoreSettings.findOne = originals.settings;
  Order.findById = originals.findById; Order.findOneAndUpdate = originals.findOneAndUpdate; Order.find = originals.find; Order.updateMany = originals.updateMany; globalThis.fetch = originals.fetch;
});

function provider(responseForPath, calls = []) {
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, text: async () => JSON.stringify({ token: "private" }) };
    calls.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
    const response = responseForPath(url);
    return { ok: response.ok ?? true, status: response.status ?? 200, text: async () => JSON.stringify(response.body || {}) };
  };
}

test("label generation uses the shipment id and duplicate requests reuse the stored label", async () => {
  const item = order(); const calls = [];
  Order.findById = () => query(item); Order.findOneAndUpdate = () => query(item);
  provider(() => ({ body: { label_created: 1, label_url: "https://bucket.s3.amazonaws.com/label.pdf" } }), calls);
  await generateShipmentLabel(item._id);
  assert.deepEqual(calls[0].body, { shipment_id: [2001] });
  assert.equal(item.labelUrl, "https://bucket.s3.amazonaws.com/label.pdf");
  await generateShipmentLabel(item._id);
  assert.equal(calls.length, 1);
});

test("label generation rejects missing AWB, cancelled shipments, provider failures, and untrusted URLs", async () => {
  const item = order(); Order.findById = () => query(item);
  item.shiprocketShipmentId = ""; await assert.rejects(generateShipmentLabel(item._id), /shipment ID/);
  item.shiprocketShipmentId = "2001"; item.awbCode = ""; await assert.rejects(generateShipmentLabel(item._id), /AWB assignment/);
  item.awbCode = "AWB1"; item.shippingStatus = "cancelled"; await assert.rejects(generateShipmentLabel(item._id), /not eligible/);
  item.shippingStatus = "awb_assigned"; Order.findOneAndUpdate = () => query(item);
  provider(() => ({ ok: false, status: 503, body: { message: "provider unavailable" } }));
  await assert.rejects(generateShipmentLabel(item._id), /Unable to generate/);
  globalThis.fetch = async () => { throw new DOMException("Timed out", "TimeoutError"); };
  await assert.rejects(generateShipmentLabel(item._id), /Unable to generate/);
  provider(() => ({ body: { label_created: 1, label_url: "https://evil.example/label.pdf" } }));
  await assert.rejects(generateShipmentLabel(item._id), /Unable to generate/);
});

test("bulk manifest generation and printing use official shipment and order id payloads", async () => {
  const items = [order("64b000000000000000000020"), order("64b000000000000000000021")]; items[1].shiprocketOrderId = "1002"; items[1].shiprocketShipmentId = "2002";
  Order.find = async () => items; Order.updateMany = async () => ({ modifiedCount: items.length }); const calls = [];
  provider((url) => url.endsWith("/manifests/generate") ? { body: { status: 1, manifest_url: "https://bucket.s3.amazonaws.com/manifest.pdf" } } : { body: { manifest_url: "https://bucket.s3.amazonaws.com/print.pdf" } }, calls);
  await generateShipmentManifest(items.map((item) => item._id));
  assert.deepEqual(calls[0].body, { shipment_id: [2001, 2002] });
  await generateShipmentManifest(items.map((item) => item._id));
  assert.equal(calls.length, 1);
  await printShipmentManifest(items.map((item) => item._id));
  assert.deepEqual(calls[1].body, { order_ids: [1001, 1002] });
  assert.equal(items[0].manifestPrintUrl, "https://bucket.s3.amazonaws.com/print.pdf");
});

test("manifest rejects invalid, cancelled, and pre-pickup selections", async () => {
  await assert.rejects(generateShipmentManifest(["invalid"]), /valid shipments/);
  const item = order(); Order.find = async () => [item]; item.shippingStatus = "cancelled";
  await assert.rejects(generateShipmentManifest([item._id]), /cannot be added/);
  item.shippingStatus = "awb_assigned"; item.pickupRequestedAt = null;
  await assert.rejects(generateShipmentManifest([item._id]), /Request pickup/);
});

test("Shiprocket invoice remains separate and never changes authoritative commerce totals", async () => {
  const item = order(); const totals = [item.productSubtotal, item.offerDiscount, item.couponDiscount, item.shippingAmount, item.totalAmount];
  Order.findById = () => query(item); Order.findOneAndUpdate = () => query(item);
  provider(() => ({ body: { is_invoice_created: true, invoice_url: "https://bucket.s3.amazonaws.com/invoice.pdf" } }));
  await generateShipmentInvoice(item._id);
  assert.deepEqual([item.productSubtotal, item.offerDiscount, item.couponDiscount, item.shippingAmount, item.totalAmount], totals);
  assert.equal(getShipmentDocument(item, "invoice"), item.shiprocketInvoiceUrl);
});

test("fulfillment document routes require admin permissions and customer routes expose none", async () => {
  const [routes, customerRoutes, model, ui] = await Promise.all([readFile(new URL("../admin/routes/adminApiRoutes.js", import.meta.url), "utf8"), readFile(new URL("../routes/orderRoutes.js", import.meta.url), "utf8"), readFile(new URL("../models/Order.js", import.meta.url), "utf8"), readFile(new URL("../../src/admin/pages/FulfillmentPage.jsx", import.meta.url), "utf8")]);
  assert.match(routes, /orders\/:id\/label.*requireAdminPermission\("shipping\.manage"\)/);
  assert.match(routes, /fulfillment\/manifest.*requireAdminPermission\("shipping\.manage"\)/);
  assert.doesNotMatch(customerRoutes, /documents|generate\/label|manifests/);
  assert.match(model, /delete value\.labelUrl/); assert.match(model, /delete value\.shiprocketInvoiceUrl/);
  assert.match(ui, /Generate Label/); assert.match(ui, /Generate Manifest/); assert.match(ui, /Print Manifest/); assert.match(ui, /Track Shipment/);
});
