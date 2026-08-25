// Generates a structured one-page invoice PDF without capturing webpage UI.
import { historicalLineTotal, historicalQuantity, historicalUnitPrice } from "./orderSnapshot.js";
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const COMPANY = {
  name: "Swavalambi Siddaganga Oil Mill",
  address: "SIDDAGANGA OIL MILL, Near Small City Club Road, Sira Gate, TUDA Layout, Tumakuru, Karnataka 572106",
  phone: "09972565174",
  email: "support@swavalambisiddagangaoilmill.com",
  gst: "",
};

function textValue(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function sanitize(value) {
  return textValue(value, "").replace(/[\u20b9]/g, "Rs.").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function esc(value) {
  return sanitize(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(value) {
  const amount = Number(value || 0);
  return `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateText(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return textValue(value, new Date().toLocaleDateString("en-IN"));
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

function getOrderNumber(order) {
  return textValue(order._id || order.id || order.orderNumber || `ORDER-${Date.now()}`);
}

function getInvoiceNumber(order, orderNumber) {
  return textValue(order.invoiceNumber || `INV-${String(orderNumber).slice(-8).toUpperCase()}`);
}

function normalizeAddress(address, fallback = "") {
  if (typeof address === "string") return address;
  if (!address) return fallback;
  return [
    address.fullName,
    address.phone,
    [address.street, address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country || "India",
  ].filter(Boolean).join("\n");
}

function getCustomer(order) {
  const shippingAddress = order.shippingAddress || {};
  const user = order.user || order.customer || {};
  return {
    name: textValue(order.customerName || user.name || shippingAddress.fullName, "Customer"),
    email: textValue(order.customerEmail || user.email || order.email, "-"),
    phone: textValue(order.customerPhone || user.phone || shippingAddress.phone || order.phone, "-"),
    billingAddress: normalizeAddress(order.billingAddress, order.address || normalizeAddress(shippingAddress)),
    shippingAddress: normalizeAddress(order.shippingAddress, order.address || normalizeAddress(shippingAddress)),
  };
}

function normalizeItems(order) {
  return (order.items || order.products || []).map((item) => {
    const product = item.product && typeof item.product === "object" ? item.product : item;
    const name = item.name || item.title || product.name || product.title || "Product";
    const variant = item.variantName || item.variant?.name || item.variant || item.volume || product.volume || item.weight || "-";
    const quantity = historicalQuantity(item);
    const unitPrice = historicalUnitPrice(item);
    const listPrice = Number(item.originalPrice || item.listPrice || product.originalPrice || unitPrice);
    const discount = Math.max(0, listPrice - unitPrice);
    return { name, variant, sku: item.sku || item.variant?.sku || "", quantity, unitPrice, listPrice, discount, total: historicalLineTotal(item) };
  });
}

function totals(order, items) {
  const subtotal = Number(order.subtotal ?? items.reduce((sum, item) => sum + item.total, 0));
  const shipping = Number(order.shippingAmount || order.shippingFee || order.deliveryCharge || 0);
  const discount = Number(order.discountAmount || order.couponDiscount || 0);
  const tax = Number(order.taxAmount || order.gstAmount || 0);
  const grandTotal = Number(order.total || order.totalAmount || Math.max(0, subtotal + shipping + tax - discount));
  return { subtotal, shipping, discount, tax, grandTotal };
}

function wrapText(value, maxChars) {
  const words = sanitize(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function buildContent(order, hasLogo, pageInfo = { page: 1, pages: 1, last: true }) {
  const commands = [];
  const orderNumber = getOrderNumber(order);
  const invoiceNumber = getInvoiceNumber(order, orderNumber);
  const customer = getCustomer(order);
  const items = normalizeItems(order);
  const total = totals(order, items);
  const rowHeight = items.length > 7 ? 18 : 22;
  const bodyFont = items.length > 7 ? 7.5 : 8.5;

  const line = (x1, y1, x2, y2, width = 0.6) => commands.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (x, y, w, h, fill = false) => commands.push(`${x} ${y} ${w} ${h} re ${fill ? "f" : "S"}`);
  const fill = (r, g, b) => commands.push(`${r} ${g} ${b} rg`);
  const stroke = (r, g, b) => commands.push(`${r} ${g} ${b} RG`);
  const text = (value, x, y, size = 9, font = "F1") => commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`);
  const rightText = (value, x, y, size = 9, font = "F1") => {
    const approx = sanitize(value).length * size * 0.48;
    text(value, x - approx, y, size, font);
  };
  const wrapped = (value, x, y, maxChars, size = 8, gap = 11, font = "F1", maxLines = 3) => {
    wrapText(value, maxChars).slice(0, maxLines).forEach((lineText, index) => text(lineText, x, y - index * gap, size, font));
  };

  stroke(0.18, 0.14, 0.11);
  fill(0.96, 0.94, 0.89);
  rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, true);
  fill(1, 1, 1);
  rect(MARGIN, 34, PAGE_WIDTH - MARGIN * 2, PAGE_HEIGHT - 68, true);
  stroke(0.33, 0.44, 0.18);
  rect(MARGIN, 34, PAGE_WIDTH - MARGIN * 2, PAGE_HEIGHT - 68, false);

  if (hasLogo) commands.push(`q 48 0 0 48 ${MARGIN} 760 cm /Logo Do Q`);
  else {
    fill(0.33, 0.44, 0.18);
    rect(MARGIN, 760, 48, 48, true);
    fill(1, 1, 1);
    text("SS", MARGIN + 13, 779, 15, "F2");
  }

  fill(0.18, 0.14, 0.11);
  text(COMPANY.name, 92, 798, 17, "F2");
  wrapped(COMPANY.address, 92, 780, 66, 8, 10, "F1", 2);
  text(`Phone: ${COMPANY.phone}`, 92, 754, 8, "F1");
  text(`Email: ${COMPANY.email}`, 92, 743, 8, "F1");
  if (COMPANY.gst) text(`GST: ${COMPANY.gst}`, 92, 732, 8, "F1");

  text("TAX INVOICE", 421, 802, 16, "F2");
  const meta = [
    ["Invoice No", invoiceNumber],
    ["Order No", orderNumber],
    ["Invoice Date", dateText(order.createdAt || order.date)],
    ["Payment", textValue(order.paymentMethod || "Online/COD")],
    ["Status", textValue(order.paymentStatus || "Confirmed")],
  ];
  meta.forEach(([label, value], index) => {
    const y = 780 - index * 13;
    text(`${label}:`, 382, y, 8, "F2");
    rightText(value, PAGE_WIDTH - MARGIN, y, 8, "F1");
  });
  line(MARGIN, 724, PAGE_WIDTH - MARGIN, 724, 0.8);

  fill(0.33, 0.44, 0.18);
  text("CUSTOMER DETAILS", MARGIN, 704, 10, "F2");
  fill(0.18, 0.14, 0.11);
  text("Customer Name", MARGIN, 686, 8, "F2");
  text(customer.name, 126, 686, 8, "F1");
  text("Email", MARGIN, 673, 8, "F2");
  text(customer.email, 126, 673, 8, "F1");
  text("Phone", MARGIN, 660, 8, "F2");
  text(customer.phone, 126, 660, 8, "F1");

  text("Billing Address", 310, 686, 8, "F2");
  wrapped(customer.billingAddress, 310, 673, 42, 8, 10, "F1", 3);
  const shippingDifferent = sanitize(customer.shippingAddress) !== sanitize(customer.billingAddress);
  if (shippingDifferent) {
    text("Shipping Address", 310, 636, 8, "F2");
    wrapped(customer.shippingAddress, 310, 623, 42, 8, 10, "F1", 3);
  }
  line(MARGIN, 612, PAGE_WIDTH - MARGIN, 612, 0.8);

  const tableTop = 590;
  const col = { product: MARGIN + 8, qty: 286, list: 350, discount: 423, unit: 486, total: PAGE_WIDTH - MARGIN - 8 };
  fill(0.94, 0.91, 0.84);
  rect(MARGIN, tableTop - 18, PAGE_WIDTH - MARGIN * 2, 22, true);
  fill(0.18, 0.14, 0.11);
  text("Product", col.product, tableTop - 10, 8, "F2");
  text("Qty", col.qty, tableTop - 10, 8, "F2");
  rightText("List", col.list, tableTop - 10, 8, "F2");
  rightText("Discount", col.discount, tableTop - 10, 8, "F2");
  rightText("Unit", col.unit, tableTop - 10, 8, "F2");
  rightText("Total", col.total, tableTop - 10, 8, "F2");
  line(MARGIN, tableTop - 20, PAGE_WIDTH - MARGIN, tableTop - 20, 0.6);

  let y = tableTop - 39;
  items.forEach((item) => {
    const name = wrapText(`${item.name}${item.variant && item.variant !== "-" ? ` (${item.variant})` : ""}${item.sku ? ` SKU: ${item.sku}` : ""}`, 38)[0];
    text(name, col.product, y, bodyFont, "F1");
    text(String(item.quantity), col.qty + 8, y, bodyFont, "F1");
    rightText(money(item.listPrice), col.list, y, bodyFont, "F1");
    rightText(item.discount > 0 ? money(item.discount) : "-", col.discount, y, bodyFont, "F1");
    rightText(money(item.unitPrice), col.unit, y, bodyFont, "F1");
    rightText(money(item.total), col.total, y, bodyFont, "F2");
    line(MARGIN, y - 8, PAGE_WIDTH - MARGIN, y - 8, 0.3);
    y -= rowHeight;
  });
  if (pageInfo.last) {
    const totalsX = 360;
    const totalsY = Math.max(122, y - 8);
    const rows = [
      ["Subtotal", money(total.subtotal)],
      ["Discount", `- ${money(total.discount)}`],
      ["Shipping", money(total.shipping)],
      ["Tax", money(total.tax)],
    ];
    rows.forEach(([label, value], index) => {
      const rowY = totalsY - index * 16;
      text(label, totalsX, rowY, 8.5, "F1");
      rightText(value, PAGE_WIDTH - MARGIN - 8, rowY, 8.5, "F1");
    });
    line(totalsX, totalsY - 54, PAGE_WIDTH - MARGIN, totalsY - 54, 0.8);
    text("Grand Total", totalsX, totalsY - 72, 11, "F2");
    rightText(money(total.grandTotal), PAGE_WIDTH - MARGIN - 8, totalsY - 72, 11, "F2");
  } else {
    text("Items continue on the next page.", MARGIN + 8, Math.max(118, y - 4), 8.5, "F2");
  }

  line(MARGIN, 72, PAGE_WIDTH - MARGIN, 72, 0.6);
  text("This is a computer-generated invoice and does not require a signature.", 142, 54, 8, "F1");
  text("Thank you for shopping with Swavalambi Siddaganga Oil Mill.", 150, 40, 8, "F2");
  rightText(`Page ${pageInfo.page} of ${pageInfo.pages}`, PAGE_WIDTH - MARGIN - 8, 40, 7.5, "F1");
  return commands.join("\n");
}

async function loadLogo() {
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "/logo.webp";
    });
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    const binary = atob(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, width: size, height: size };
  } catch {
    return null;
  }
}

function asciiBytes(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function buildPdf(contents, logo) {
  const pageContents = Array.isArray(contents) ? contents : [contents];
  const pageCount = pageContents.length;
  const objects = [];
  const add = (chunks) => {
    objects.push(Array.isArray(chunks) ? chunks : [asciiBytes(chunks)]);
    return objects.length;
  };

  const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pageContents.map((_, index) => index + 3);
  const fontRegularId = pageCount + 3;
  const fontBoldId = pageCount + 4;
  const logoId = logo ? pageCount + 5 : null;
  const firstContentId = pageCount + (logo ? 6 : 5);
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  const resources = logo ? `<< /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Logo ${logoId} 0 R >> >>` : `<< /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >>`;
  pageContents.forEach((_, index) => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} /Contents ${firstContentId + index} 0 R >>`));
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  if (logo) {
    add([asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`), logo.bytes, asciiBytes("\nendstream")]);
  }
  pageContents.forEach((content) => {
    const stream = asciiBytes(content);
    add([asciiBytes(`<< /Length ${stream.length} >>\nstream\n`), stream, asciiBytes("\nendstream")]);
  });

  const chunks = [asciiBytes("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(asciiBytes(`${index + 1} 0 obj\n`), ...object, asciiBytes("\nendobj\n"));
  });
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(asciiBytes(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  offsets.slice(1).forEach((offset) => chunks.push(asciiBytes(`${String(offset).padStart(10, "0")} 00000 n \n`)));
  chunks.push(asciiBytes(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

export async function downloadInvoicePdf(order) {
  const orderNumber = getOrderNumber(order);
  const logo = await loadLogo();
  const blob = createInvoicePdfBlob(order, logo);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Invoice-${orderNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createInvoicePdfBlob(order, logo = null) {
  const sourceItems = order.items || order.products || [];
  const chunks = [];
  const pageCount = Math.max(1, Math.ceil(sourceItems.length / 18));
  const chunkSize = Math.max(1, Math.ceil(sourceItems.length / pageCount));
  for (let index = 0; index < sourceItems.length; index += chunkSize) chunks.push(sourceItems.slice(index, index + chunkSize));
  if (!chunks.length) chunks.push([]);
  const completeTotals = totals(order, normalizeItems(order));
  const contents = chunks.map((items, index) => buildContent({ ...order, items, products: undefined, subtotal: completeTotals.subtotal, shippingAmount: completeTotals.shipping, discountAmount: completeTotals.discount, taxAmount: completeTotals.tax, totalAmount: completeTotals.grandTotal }, Boolean(logo), { page: index + 1, pages: chunks.length, last: index === chunks.length - 1 }));
  return buildPdf(contents, logo);
}
