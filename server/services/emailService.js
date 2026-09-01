// Sends transactional emails through the configured production provider.
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logExternalFailure, isServiceAvailable } from "./serviceStatusService.js";

function htmlLayout(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f7f0e3;font-family:Arial,sans-serif;color:#2f241d"><div style="max-width:560px;margin:0 auto;padding:32px"><h1 style="font-family:Georgia,serif;color:#4f6f2f">${title}</h1><div style="font-size:15px;line-height:1.7">${body}</div><p style="margin-top:28px;font-size:12px;color:#7b6b5d">Swavalambi Siddaganga Oil Mill</p></div></body></html>`;
}

async function sendWithResend(message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.email.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.email.from, to: message.to, reply_to: message.replyTo || env.email.replyTo || undefined, subject: message.subject, text: message.text, html: message.html || htmlLayout(message.subject, `<p>${message.text}</p>`) }),
    signal: AbortSignal.timeout(10_000),
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
  return sendMail({ to: user.email, subject: "Welcome to Swavalambi Siddaganga Oil Mill", text: `Welcome ${user.name}. Your Swavalambi Siddaganga Oil Mill account is ready.`, html: htmlLayout("Welcome to Swavalambi Siddaganga Oil Mill", `<p>Welcome ${user.name}. Your account is ready for fresh cold pressed oil orders.</p>`) });
}

export function sendVerificationEmail(user, token) {
  const url = `${env.clientUrl}/auth/verify-email/${token}`;
  return sendMail({ to: user.email, subject: "Verify your Swavalambi Siddaganga Oil Mill account", text: `Verify your email: ${url}`, html: htmlLayout("Verify your email", `<p>Confirm your email to secure your Swavalambi Siddaganga Oil Mill account.</p><p><a href="${url}" style="color:#4f6f2f;font-weight:700">Verify email</a></p>`) });
}

export function sendPasswordResetEmail(user, token) {
  const url = `${env.clientUrl}/auth/reset-password/${token}`;
  return sendMail({ to: user.email, subject: "Reset your Swavalambi Siddaganga Oil Mill password", text: `Reset your password: ${url}`, html: htmlLayout("Reset your password", `<p>Use this secure link to reset your password.</p><p><a href="${url}" style="color:#4f6f2f;font-weight:700">Reset password</a></p>`) });
}

export function sendOtpEmail(user, code, purpose) {
  return sendMail({ to: user.email, subject: "Swavalambi Siddaganga Oil Mill security code", text: `Your ${purpose} code is ${code}. It expires shortly.`, html: htmlLayout("Security code", `<p>Your ${purpose} code is:</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</p><p>This code expires shortly.</p>`) });
}

export async function sendCustomerOtpEmail({ email, name }, code) {
  if (env.email.provider !== "resend" || !env.email.resendApiKey || !env.email.from) throw new ApiError("Email delivery is unavailable.", 503);
  const safeName = String(name || "there").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const result = await sendWithResend({
    to: email,
    subject: "Your verification code",
    text: `Hi ${name || "there"},\n\nYour verification code is ${code}.\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, you can safely ignore this email.\n\nDo not share this code with anyone.`,
    html: htmlLayout("Your verification code", `<p>Hi ${safeName},</p><p>Your verification code is:</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</p><p>This code expires in 5 minutes.</p><p>If you did not request this code, you can safely ignore this email.</p><p>Do not share this code with anyone.</p>`),
  });
  if (!result?.id) throw new ApiError("Email delivery was not accepted.", 502);
  return { accepted: true };
}

export function sendNewDeviceEmail(user, details) {
  return sendMail({ to: user.email, subject: "New Swavalambi Siddaganga Oil Mill login detected", text: `New login detected from ${details.browser || "Unknown browser"} on ${details.os || "Unknown OS"}.` });
}

export function sendContactFormEmail(message) {
  if (!env.email.contactTo) return Promise.resolve({ skipped: true });
  return sendMail({ to: env.email.contactTo, replyTo: message.email, subject: `Swavalambi Siddaganga Oil Mill contact: ${message.subject || "New message"}`, text: `${message.name} <${message.email}>\n${message.phone || ""}\n\n${message.message}` });
}

