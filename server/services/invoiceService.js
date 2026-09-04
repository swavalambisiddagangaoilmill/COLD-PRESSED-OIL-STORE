import { createInvoicePdfBlob } from "../../src/utils/invoicePdf.js";

export function invoiceNumberFor(order) {
  return order.invoiceNumber || `INV-${String(order._id || order.id).slice(-8).toUpperCase()}`;
}

export async function createInvoicePdfBuffer(order) {
  const blob = createInvoicePdfBlob(order);
  return Buffer.from(await blob.arrayBuffer());
}
