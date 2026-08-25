import test from "node:test";
import assert from "node:assert/strict";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { mergeRequestedCartItems } from "../services/cartService.js";
import { buildVariantOrderItem, customerOrderPaymentState } from "../services/orderService.js";
import { createInvoicePdfBlob } from "../../src/utils/invoicePdf.js";
import { historicalLineTotal, historicalUnitPrice } from "../../src/utils/orderSnapshot.js";

const oid = (suffix) => `64b0000000000000000000${suffix}`;

test("product variants independently retain price stock images and active state", async () => {
  const product = new Product({
    title: "Groundnut Oil", slug: "groundnut-oil", description: "Cold pressed",
    variants: [
      { _id: oid("11"), name: "1L", sku: "GO-1L", price: 180, mrp: 200, stock: 50, weight: 1, dimensions: { length: 10, width: 10, height: 25 }, images: [{ url: "1l.jpg" }], isActive: true },
      { _id: oid("12"), name: "5L", sku: "GO-5L", price: 850, mrp: 900, stock: 0, weight: 5, dimensions: { length: 20, width: 20, height: 35 }, images: [{ url: "5l.jpg" }], isActive: false },
    ],
  });
  await product.validate();
  assert.equal(product.variants[0].stock, 50);
  assert.equal(product.variants[1].images[0].url, "5l.jpg");
  assert.equal(product.variants[0].weight, 1);
  assert.equal(product.variants[1].dimensions.height, 35);
});

test("cart merges the same variant but keeps two variants of one product separate", () => {
  const merged = mergeRequestedCartItems([
    { product: oid("01"), variant: oid("11"), quantity: 2 },
  ], [
    { productId: oid("01"), variantId: oid("11"), quantity: 1 },
    { productId: oid("01"), variantId: oid("12"), quantity: 1 },
  ]);
  assert.equal(merged.size, 2);
  assert.equal(merged.get(`${oid("01")}:${oid("11")}`).quantity, 3);
});

test("a product without a variant fails validation", async () => {
  const product = new Product({ title: "Invalid", slug: "invalid", description: "Invalid", variants: [] });
  await assert.rejects(product.validate(), /At least one active variant/);
});

test("order item snapshot ignores a manipulated client price and rejects excess stock", () => {
  const product = new Product({ title: "Groundnut Oil", slug: "groundnut-oil", description: "Cold pressed", variants: [{ _id: oid("11"), name: "5L", sku: "GO-5L", price: 850, mrp: 900, stock: 2, weight: 5, dimensions: { length: 20, width: 20, height: 35 }, images: [{ url: "5l.jpg" }], isActive: true }] });
  const snapshot = buildVariantOrderItem(product, { variantId: oid("11"), quantity: 2, price: 1 });
  assert.equal(snapshot.price, 850);
  assert.equal(snapshot.total, 1700);
  assert.equal(snapshot.variantName, "5L");
  assert.throws(() => buildVariantOrderItem(product, { variantId: oid("11"), quantity: 3 }), /does not have enough stock/);
});

test("customer order payment state cannot be elevated by browser fields", () => {
  const browserPayload = { paymentMethod: "razorpay", paymentStatus: "paid", razorpayPaymentId: "forged" };
  assert.deepEqual({ ...browserPayload, ...customerOrderPaymentState() }, { ...browserPayload, paymentMethod: "cod", paymentStatus: "pending" });
  assert.equal(customerOrderPaymentState().razorpayPaymentId, undefined);
});

test("order schema retains a complete historical variant snapshot", async () => {
  const order = new Order({ user: oid("01"), products: [{ product: oid("02"), variant: oid("11"), title: "Groundnut Oil", variantName: "5L", sku: "GO-5L", image: "5l.jpg", quantity: 2, price: 850, mrp: 900, total: 1700 }], shippingAddress: { fullName: "Test User", phone: "9999999999", street: "Street", city: "City", state: "State", postalCode: "123456" }, totalAmount: 1700 });
  await order.validate();
  assert.deepEqual({ variantName: order.products[0].variantName, sku: order.products[0].sku, price: order.products[0].price, total: order.products[0].total }, { variantName: "5L", sku: "GO-5L", price: 850, total: 1700 });
});

test("downloadable invoice PDF includes variant and SKU snapshot", async () => {
  const blob = createInvoicePdfBlob({ _id: "ORDER1", products: [{ title: "Groundnut Oil", variantName: "5L", sku: "GO-5L", quantity: 2, price: 850, mrp: 900, total: 1700 }], shippingAddress: { fullName: "Test User", phone: "9999999999", street: "Street", city: "City", state: "State", postalCode: "123456" }, totalAmount: 1700 });
  const pdfText = new TextDecoder().decode(await blob.arrayBuffer());
  assert.match(pdfText, /Groundnut Oil/);
  assert.match(pdfText, /5L/);
  assert.match(pdfText, /SKU: GO-5L/);
});

test("historical line totals derive from stored unit price even when legacy total is missing", () => {
  const item = { quantity: 2, price: 850, product: { price: 9999 }, total: undefined };
  assert.equal(historicalUnitPrice(item), 850);
  assert.equal(historicalLineTotal(item), 1700);
});

test("invoice never substitutes a current populated product price for a missing snapshot price", async () => {
  const blob = createInvoicePdfBlob({ _id: "ORDER2", products: [{ title: "Groundnut Oil", variantName: "5L", sku: "GO-5L", quantity: 2, product: { price: 9999 } }], shippingAddress: { fullName: "Test User", phone: "9999999999", street: "Street", city: "City", state: "State", postalCode: "123456" }, totalAmount: 0 });
  const pdfText = new TextDecoder().decode(await blob.arrayBuffer());
  assert.doesNotMatch(pdfText, /9,999/);
  assert.match(pdfText, /Rs\. 0\.00/);
});
