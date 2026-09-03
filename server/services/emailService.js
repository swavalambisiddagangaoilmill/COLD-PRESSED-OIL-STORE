// Sends transactional emails through the configured production provider.
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logExternalFailure, isServiceAvailable } from "./serviceStatusService.js";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function paragraph(content, style = "") {
  return `<p style="margin:0 0 16px;${style}">${content}</p>`;
}

function actionButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td style="border-radius:6px;background:#214f3b"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(label)}</a></td></tr></table>`;
}

function codePanel(code) {
  return `<div style="margin:22px 0;padding:18px 20px;border:1px solid #e3d8c8;border-radius:6px;background:#faf6ef;text-align:center;font-size:30px;font-weight:700;letter-spacing:6px;color:#214f3b">${escapeHtml(code)}</div>`;
}

function detailRow(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:7px 12px 7px 0;color:#76685c;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0;color:#2f241d;font-size:14px;vertical-align:top;word-break:break-word">${escapeHtml(value)}</td></tr>`;
}

function htmlLayout(title, body, preheader = "") {
  const safeTitle = escapeHtml(title);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:Arial,Helvetica,sans-serif;color:#2f241d"><span style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0">${escapeHtml(preheader || title)}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f0e8"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6ddd0"><tr><td style="padding:22px 26px;border-bottom:3px solid #214f3b"><p style="margin:0;color:#214f3b;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700">Swavalambi Siddaganga Oil Mill</p><p style="margin:5px 0 0;color:#8a5f3d;font-size:11px;letter-spacing:1.4px;text-transform:uppercase">Traditional cold pressed oils</p></td></tr><tr><td style="padding:30px 26px 24px"><h1 style="margin:0 0 18px;color:#214f3b;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:700">${safeTitle}</h1><div style="font-size:15px;line-height:1.65;color:#44372e">${body}</div></td></tr><tr><td style="padding:18px 26px;background:#214f3b;color:#ffffff"><p style="margin:0;font-size:12px;line-height:1.6">Swavalambi Siddaganga Oil Mill · Tumakuru, Karnataka</p><p style="margin:3px 0 0;font-size:11px;line-height:1.5;color:#d7e1db">This is an automated transactional email from our website.</p></td></tr></table></td></tr></table></body></html>`;
}

const emailThemeColors = new Map([
  ["#214f3b", "#1F3A24"],
  ["#2f241d", "#1F1F1F"],
  ["#44372e", "#1F1F1F"],
  ["#8a5f3d", "#2F5D3A"],
  ["#76685c", "#66745F"],
  ["#f5f0e8", "#F7F7F5"],
  ["#faf6ef", "#F7F7F5"],
  ["#e3d8c8", "#E4E7E2"],
  ["#e6ddd0", "#E4E7E2"],
  ["#eee6da", "#E4E7E2"],
  ["#d7e1db", "#DCE5DE"],
]);

function applyCurrentWebsiteTheme(html = "") {
  let themedHtml = html;
  for (const [previousColor, currentColor] of emailThemeColors) themedHtml = themedHtml.replaceAll(previousColor, currentColor);
  return themedHtml;
}

async function sendWithResend(message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.email.resendApiKey}`, "Content-Type": "application/json", ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}) },
    body: JSON.stringify({ from: env.email.from, to: message.to, reply_to: message.replyTo || env.email.replyTo || undefined, subject: message.subject, text: message.text, html: applyCurrentWebsiteTheme(message.html || htmlLayout(message.subject, paragraph(escapeHtml(message.text)))) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || "Email delivery failed.", 502);
  return data;
}

export async function sendMail(message) {
  if (!env.isProduction && !env.email.resendApiKey) return { skipped: true, provider: "development" };
  if (env.email.provider !== "resend" || !isServiceAvailable("resend")) {
    logExternalFailure("resend", new Error("Email provider is not configured."), { subject: message.subject });
    return { skipped: true, provider: env.email.provider, reason: "EMAIL_PROVIDER_UNAVAILABLE" };
  }
  try {
    return await sendWithResend(message);
  } catch (error) {
    logExternalFailure("resend", error, { subject: message.subject });
    return { skipped: true, provider: "resend", reason: "EMAIL_PROVIDER_UNAVAILABLE" };
  }
}

export function sendWelcomeEmail(user) {
  const name = escapeHtml(user.name || "there");
  return sendMail({ to: user.email, subject: "Welcome to Swavalambi Siddaganga Oil Mill", text: `Welcome ${user.name}. Your Swavalambi Siddaganga Oil Mill account is ready.`, html: htmlLayout("Welcome to the mill", `${paragraph(`Welcome ${name}.`) }${paragraph("Your account is ready for fresh cold pressed oil orders.")}`, "Your account is ready.") });
}

export function sendVerificationEmail(user, token) {
  const url = `${env.clientUrl}/auth/verify-email/${token}`;
  return sendMail({ to: user.email, subject: "Verify your Swavalambi Siddaganga Oil Mill account", text: `Verify your email: ${url}`, html: htmlLayout("Verify your email", `${paragraph("Confirm your email to secure your Swavalambi Siddaganga Oil Mill account.")}${actionButton("Verify email", url)}${paragraph("If you did not create this account, you can ignore this email.", "color:#76685c;font-size:13px")}`, "Confirm your email address.") });
}

export function sendPasswordResetEmail(user, token) {
  const url = `${env.clientUrl}/auth/reset-password/${token}`;
  return sendMail({ to: user.email, subject: "Reset your Swavalambi Siddaganga Oil Mill password", text: `Reset your password: ${url}`, html: htmlLayout("Reset your password", `${paragraph("Use this secure link to choose a new password.")}${actionButton("Reset password", url)}${paragraph("If you did not request a reset, no action is required.", "color:#76685c;font-size:13px")}`, "Use the secure link to reset your password.") });
}

export function sendOtpEmail(user, code, purpose) {
  return sendMail({ to: user.email, subject: "Swavalambi Siddaganga Oil Mill security code", text: `Your ${purpose} code is ${code}. It expires shortly.`, html: htmlLayout("Security code", `${paragraph(`Your ${escapeHtml(purpose)} code is:`)}${codePanel(code)}${paragraph("This code expires shortly and can be used only once.", "color:#76685c;font-size:13px")}`, "Your security code is ready.") });
}

export function sendCustomerAuthOtpEmail(email, code) {
  return sendMail({ to: email, subject: "Your Swavalambi Siddaganga Oil Mill login code", text: `Your one-time login code is ${code}. It expires in 5 minutes.`, html: htmlLayout("Your one-time login code", `${paragraph("Use this code to access your customer account:")}${codePanel(code)}${paragraph("This code expires in 5 minutes and can be used only once.", "color:#76685c;font-size:13px")}`, "Your one-time login code is ready.") });
}

export function sendNewDeviceEmail(user, details) {
  if (user?.role !== "admin") return Promise.resolve({ skipped: true, reason: "ADMIN_ONLY_LOGIN_ALERT" });
  const browser = details.browser || "Unknown browser";
  const os = details.os || "Unknown OS";
  return sendMail({ to: user.email, subject: "New Swavalambi Siddaganga Oil Mill login detected", text: `New login detected from ${browser} on ${os}.`, html: htmlLayout("New login detected", `${paragraph("A new login to your account was detected.")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;padding:12px 16px;background:#faf6ef">${detailRow("Browser", browser)}${detailRow("Device", os)}</table>${paragraph("If this was not you, secure your account immediately.", "color:#76685c;font-size:13px")}`, "A new login to your account was detected.") });
}

export function sendContactFormEmail(message) {
  if (!env.email.contactTo) return Promise.resolve({ skipped: true });
  const subject = message.subject || "New message";
  const text = `${message.name} <${message.email}>\n${message.phone || ""}\n\n${message.message}`;
  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;padding:12px 16px;background:#faf6ef">${detailRow("Name", message.name)}${detailRow("Email", message.email)}${detailRow("Phone", message.phone)}${detailRow("Subject", subject)}</table>`;
  return sendMail({ to: env.email.contactTo, replyTo: message.email, subject: `Swavalambi Siddaganga Oil Mill contact: ${subject}`, text, html: htmlLayout("New contact message", `${details}${paragraph(escapeHtml(message.message).replace(/\n/g, "<br>"))}`, `New website message from ${message.name}.`) });
}

export function sendOrderConfirmationEmail(order) {
  if (!order?.user?.email) return Promise.resolve({ skipped: true, reason: "CUSTOMER_EMAIL_MISSING" });
  const orderId = String(order._id);
  const allProducts = (Array.isArray(order.products) ? order.products : []).filter(Boolean);
  const products = allProducts.slice(0, 5);
  const productRows = products.map((item) => `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid #eee6da;color:#2f241d;font-size:14px">${escapeHtml(item.title || "Product")}</td><td align="center" style="padding:9px 8px;border-bottom:1px solid #eee6da;color:#76685c;font-size:14px">${escapeHtml(item.quantity || 1)}</td></tr>`).join("");
  const remainingProducts = Math.max(0, allProducts.length - products.length);
  const productText = `${products.map((item) => `${item.title || "Product"} x ${item.quantity || 1}`).join("\n")}${remainingProducts ? `\n+ ${remainingProducts} more item${remainingProducts === 1 ? "" : "s"}` : ""}`;
  const trackUrl = `${env.clientUrl}/account/orders/${encodeURIComponent(orderId)}`;
  const paymentStatus = String(order.paymentStatus || "pending").replaceAll("_", " ");
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(order.totalAmount) || 0);
  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#faf6ef"><tr><td style="padding:12px 16px;color:#76685c;font-size:13px">Order ID</td><td align="right" style="padding:12px 16px;color:#2f241d;font-size:14px;font-weight:700;word-break:break-all">${escapeHtml(orderId)}</td></tr><tr><td style="padding:0 16px 12px;color:#76685c;font-size:13px">Payment</td><td align="right" style="padding:0 16px 12px;color:#2f241d;font-size:14px;text-transform:capitalize">${escapeHtml(paymentStatus)}</td></tr><tr><td style="padding:0 16px 12px;color:#76685c;font-size:13px">Total</td><td align="right" style="padding:0 16px 12px;color:#214f3b;font-size:15px;font-weight:700">${escapeHtml(amount)}</td></tr></table>`;
  const items = productRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><th align="left" style="padding:8px 12px 8px 0;color:#76685c;font-size:12px;text-transform:uppercase">Products</th><th align="center" style="padding:8px;color:#76685c;font-size:12px;text-transform:uppercase">Qty</th></tr>${productRows}${remainingProducts ? `<tr><td colspan="2" style="padding:10px 0;color:#76685c;font-size:13px">+ ${remainingProducts} more item${remainingProducts === 1 ? "" : "s"}</td></tr>` : ""}</table>` : "";
  return sendMail({
    to: order.user.email,
    subject: `Order ${orderId} confirmed`,
    text: `Your order #${orderId} has been confirmed and is now being prepared.\n\n${productText}\n\nTotal: ${amount}\nPayment: ${paymentStatus}\nTrack your order: ${trackUrl}`,
    html: htmlLayout("Order confirmed", `${paragraph(`Your order <strong>#${escapeHtml(orderId)}</strong> has been confirmed and is now being prepared.`)}${details}${items}${actionButton("Track Your Order", trackUrl)}`, "Your order has been confirmed."),
    idempotencyKey: `order-confirmed/${orderId}`,
  });
}

export function sendShipmentReadyEmail(order) {
  if (!order?.user?.email || !order.awbCode) return Promise.resolve({ skipped: true, reason: "TRACKING_DETAILS_MISSING" });
  const orderId = String(order._id);
  const trackUrl = `${env.clientUrl}/account/orders/${encodeURIComponent(orderId)}`;
  const products = (Array.isArray(order.products) ? order.products : []).filter(Boolean).slice(0, 5);
  const summary = products.map((item) => `${item.title || "Product"} x ${item.quantity || 1}`).join("\n");
  const rows = products.map((item) => `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee6da;font-size:14px">${escapeHtml(item.title || "Product")}</td><td align="center" style="padding:8px;border-bottom:1px solid #eee6da;font-size:14px">${escapeHtml(item.quantity || 1)}</td></tr>`).join("");
  const payment = String(order.paymentStatus || "pending").replaceAll("_", " ");
  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:#faf6ef"><tr><td style="padding:12px 16px;color:#76685c;font-size:13px">Order ID</td><td align="right" style="padding:12px 16px;font-size:14px;font-weight:700;word-break:break-all">${escapeHtml(orderId)}</td></tr><tr><td style="padding:0 16px 12px;color:#76685c;font-size:13px">AWB</td><td align="right" style="padding:0 16px 12px;font-size:14px;font-weight:700">${escapeHtml(order.awbCode)}</td></tr><tr><td style="padding:0 16px 12px;color:#76685c;font-size:13px">Payment</td><td align="right" style="padding:0 16px 12px;font-size:14px;text-transform:capitalize">${escapeHtml(payment)}</td></tr></table>`;
  const items = rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">${rows}</table>` : "";
  return sendMail({ to: order.user.email, subject: `Order ${orderId} is ready for shipment`, text: `Your order #${orderId} is ready for shipment.\n${summary}\nPayment: ${payment}\nAWB: ${order.awbCode}\nTrack your order: ${trackUrl}`, html: htmlLayout("Your order is ready for shipment", `${paragraph("Your order has been prepared and tracking information is now available.")}${details}${items}${actionButton("Track Your Order", trackUrl)}`, "Tracking is now available for your order."), idempotencyKey: `order-shipment-ready/${orderId}` });
}

