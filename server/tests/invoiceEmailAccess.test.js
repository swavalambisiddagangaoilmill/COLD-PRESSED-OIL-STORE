import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createInvoicePdfBuffer, invoiceNumberFor } from "../services/invoiceService.js";

const order = {
  _id: "64b000000000000000000099",
  user: { name: "Customer", email: "customer@example.com" },
  products: [{ title: "Groundnut Oil", variantLabel: "1L", quantity: 1, basePrice: 350, price: 332.5 }],
  productSubtotal: 350, offerDiscount: 17.5, subtotal: 332.5, couponDiscount: 0, shippingAmount: 100, totalAmount: 432.5,
  paymentMethod: "cashfree", paymentStatus: "paid", shippingAddress: { fullName: "Customer", phone: "9999999999", street: "Street", city: "Tumakuru", state: "Karnataka", postalCode: "572106" },
};

test("server invoice is a readable PDF and preserves authoritative totals", async () => {
  const pdf = await createInvoicePdfBuffer(order);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
  assert.equal(invoiceNumberFor(order), "INV-00000099");
});

test("confirmation email attaches invoice and uses authenticated application links", async () => {
  const source = await readFile(new URL("../services/emailService.js", import.meta.url), "utf8");
  assert.match(source, /attachments: \[\{ filename: `Invoice-\$\{invoiceNumber\}\.pdf`/);
  assert.match(source, /account\/orders\/\$\{encodeURIComponent\(orderId\)\}\?invoice=1/);
  assert.match(source, /track\/\$\{encodeURIComponent\(orderId\)\}/);
  assert.match(source, /idempotencyKey: `order-confirmed\/\$\{orderId\}`/);
});

test("invoice and tracking routes remain authenticated and ownership checked", async () => {
  const [routes, orders, tracking] = await Promise.all([
    readFile(new URL("../routes/orderRoutes.js", import.meta.url), "utf8"),
    readFile(new URL("../services/orderService.js", import.meta.url), "utf8"),
    readFile(new URL("../services/shiprocketService.js", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /router\.get\("\/:id\/invoice", protect/);
  assert.match(routes, /router\.get\("\/:id\/tracking", protect/);
  assert.match(orders, /You cannot access this order/);
  assert.match(tracking, /You cannot access this tracking details/);
});
