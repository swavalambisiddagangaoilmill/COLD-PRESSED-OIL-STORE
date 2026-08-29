// Secure, consent-enforced WhatsApp marketing orchestration.
import mongoose from "mongoose";
import { env } from "../config/env.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import WhatsAppCampaign from "../models/WhatsAppCampaign.js";
import { ApiError } from "../utils/ApiError.js";
import { maskPhone, normalizeIndianPhone } from "../utils/phone.js";
import { sendApprovedMarketingTemplate } from "./whatsappService.js";

const AUDIENCES = new Set(["opted_in_customers", "recent_customers", "previous_buyers", "individual_customers"]);
const ALLOWED_TEMPLATE = {
  id: "marketing_offer",
  metaName: env.whatsapp.marketingTemplateName,
  label: "Marketing offer",
  preview: "A special offer from Swavalambi Siddaganga Oil Mill: {{offer}}",
  variables: [{ key: "offer", label: "Offer", maxLength: 80 }],
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function templateById(id) {
  if (id !== ALLOWED_TEMPLATE.id) throw new ApiError("Select an approved WhatsApp template.", 422);
  return ALLOWED_TEMPLATE;
}

function validateVariables(template, input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const allowed = new Set(template.variables.map((item) => item.key));
  if (Object.keys(source).some((key) => !allowed.has(key))) throw new ApiError("Template variables are invalid.", 422);
  return Object.fromEntries(template.variables.map((definition) => {
    const value = String(source[definition.key] || "").trim();
    if (!value || value.length > definition.maxLength || /[\u0000-\u001f\u007f]/.test(value)) throw new ApiError(`${definition.label} is required and must be ${definition.maxLength} characters or fewer.`, 422);
    return [definition.key, value];
  }));
}

function publicTemplate() {
  return { id: ALLOWED_TEMPLATE.id, label: ALLOWED_TEMPLATE.label, preview: ALLOWED_TEMPLATE.preview, variables: ALLOWED_TEMPLATE.variables };
}

function renderPreview(template, variables) {
  return template.variables.reduce((text, item) => text.replaceAll(`{{${item.key}}}`, variables[item.key]), template.preview);
}

async function eligibleUsers(criteria) {
  if (!AUDIENCES.has(criteria.audience)) throw new ApiError("Select a valid audience.", 422);
  const base = { role: "user", whatsappOptIn: true, isDisabled: { $ne: true }, phone: { $exists: true, $nin: [null, ""] } };
  let query = base;
  if (criteria.audience === "recent_customers") query = { ...base, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } };
  if (criteria.audience === "previous_buyers") {
    const buyerIds = await Order.distinct("user");
    query = { ...base, _id: { $in: buyerIds } };
  }
  if (criteria.audience === "individual_customers") {
    const ids = Array.isArray(criteria.customerIds) ? [...new Set(criteria.customerIds.map(String))] : [];
    if (!ids.length || ids.length > 100 || ids.some((id) => !mongoose.isValidObjectId(id))) throw new ApiError("Select between 1 and 100 valid customers.", 422);
    query = { ...base, _id: { $in: ids } };
  }
  const candidates = await User.find(query).select("_id name phone whatsappOptIn").lean();
  const seen = new Set();
  return candidates.filter((user) => {
    if (user.whatsappOptIn !== true) return false;
    try {
      const phone = normalizeIndianPhone(user.phone);
      if (seen.has(phone)) return false;
      seen.add(phone);
      return true;
    } catch { return false; }
  });
}

export function listMarketingTemplates() {
  return [publicTemplate()];
}

export async function listEligibleCustomers(search = "") {
  const safe = String(search || "").trim().slice(0, 60);
  const query = { role: "user", whatsappOptIn: true, isDisabled: { $ne: true }, phone: { $exists: true, $nin: [null, ""] } };
  if (safe) query.name = { $regex: safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const users = await User.find(query).select("_id name phone whatsappOptIn").sort({ createdAt: -1 }).limit(50).lean();
  return users.flatMap((user) => {
    try { return [{ id: String(user._id), name: user.name || "Customer", maskedPhone: maskPhone(user.phone), whatsappOptIn: true }]; } catch { return []; }
  });
}

export async function previewAudience(criteria) {
  const recipients = await eligibleUsers(criteria);
  return { recipientCount: recipients.length };
}

export function previewTemplate(templateId, inputVariables) {
  const template = templateById(templateId);
  const variables = validateVariables(template, inputVariables);
  return { preview: renderPreview(template, variables) };
}

export async function sendTestMarketingMessage(templateId, inputVariables) {
  const template = templateById(templateId);
  const variables = validateVariables(template, inputVariables);
  if (!env.whatsapp.marketingTestPhone) throw new ApiError("WhatsApp marketing test destination is not configured.", 503);
  let phone;
  try { phone = normalizeIndianPhone(env.whatsapp.marketingTestPhone); } catch { throw new ApiError("WhatsApp marketing test destination is invalid.", 503); }
  try {
    const response = await sendApprovedMarketingTemplate(phone, template.metaName, template.variables.map((item) => variables[item.key]));
    return { sent: Boolean(response) };
  } catch {
    throw new ApiError("Test message could not be sent. Please try again.", 502);
  }
}

export async function createCampaign(adminId, payload, idempotencyKey) {
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new ApiError("A valid idempotency key is required.", 422);
  const existing = await WhatsAppCampaign.findOne({ idempotencyKey });
  if (existing) {
    if (String(existing.initiatedBy) !== String(adminId)) throw new ApiError("Idempotency key is already in use.", 409);
    return { campaign: campaignSummary(existing), duplicate: true };
  }
  const template = templateById(payload.templateId);
  const variables = validateVariables(template, payload.variables);
  const recipients = await eligibleUsers(payload);
  if (!recipients.length) throw new ApiError("No eligible opted-in recipients were found.", 422);
  const name = String(payload.name || `${template.label} ${new Date().toISOString().slice(0, 10)}`).trim().slice(0, 120);
  try {
    const campaign = await WhatsAppCampaign.create({ name, templateId: template.id, variables, audience: payload.audience, initiatedBy: adminId, idempotencyKey, recipientCount: recipients.length, recipients: recipients.map((user) => ({ user: user._id })) });
    queueCampaign(campaign._id);
    return { campaign: campaignSummary(campaign), duplicate: false };
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await WhatsAppCampaign.findOne({ idempotencyKey });
      if (!duplicate || String(duplicate.initiatedBy) !== String(adminId)) throw new ApiError("Idempotency key is already in use.", 409);
      return { campaign: campaignSummary(duplicate), duplicate: true };
    }
    throw error;
  }
}

async function processCampaign(campaignId) {
  const campaign = await WhatsAppCampaign.findOneAndUpdate({ _id: campaignId, status: "queued" }, { $set: { status: "sending", startedAt: new Date() } }, { new: true });
  if (!campaign) return;
  const template = templateById(campaign.templateId);
  const variables = Object.fromEntries(campaign.variables || []);
  for (let index = 0; index < campaign.recipients.length; index += 1) {
    const claimed = await WhatsAppCampaign.updateOne({ _id: campaign._id, status: "sending", [`recipients.${index}.status`]: "queued" }, { $set: { [`recipients.${index}.status`]: "sending" } });
    if (claimed.modifiedCount !== 1) continue;
    const recipient = campaign.recipients[index];
    const user = await User.findOne({ _id: recipient.user, role: "user", whatsappOptIn: true, isDisabled: { $ne: true } }).select("phone whatsappOptIn").lean();
    let status = "skipped";
    let providerMessageId;
    let failureCode = "INELIGIBLE_AT_SEND_TIME";
    if (user?.phone) {
      try {
        const phone = normalizeIndianPhone(user.phone);
        const response = await sendApprovedMarketingTemplate(phone, template.metaName, template.variables.map((item) => variables[item.key]));
        status = "sent";
        providerMessageId = response?.messages?.[0]?.id;
        failureCode = undefined;
      } catch { status = "failed"; failureCode = "PROVIDER_SEND_FAILED"; }
    }
    await WhatsAppCampaign.updateOne({ _id: campaign._id }, { $set: { [`recipients.${index}.status`]: status, [`recipients.${index}.providerMessageId`]: providerMessageId, [`recipients.${index}.failureCode`]: failureCode, [`recipients.${index}.processedAt`]: new Date() } });
    await delay(250);
  }
  const finished = await WhatsAppCampaign.findById(campaign._id);
  const counts = finished.recipients.reduce((totals, item) => ({ ...totals, [item.status]: (totals[item.status] || 0) + 1 }), {});
  const sentCount = (counts.sent || 0) + (counts.delivered || 0) + (counts.read || 0);
  const failedCount = counts.failed || 0;
  const skippedCount = counts.skipped || 0;
  const status = sentCount === 0 ? "failed" : failedCount || skippedCount ? "partially_failed" : "completed";
  await WhatsAppCampaign.updateOne({ _id: campaign._id }, { $set: { status, sentCount, deliveredCount: counts.delivered || 0, readCount: counts.read || 0, failedCount, skippedCount, completedAt: new Date() } });
}

export function queueCampaign(campaignId) {
  setImmediate(() => processCampaign(campaignId).catch(() => WhatsAppCampaign.updateOne({ _id: campaignId, status: "sending" }, { $set: { status: "failed", completedAt: new Date() } }).catch(() => undefined)));
}

export async function resumeMarketingCampaigns() {
  await WhatsAppCampaign.updateMany({ status: "sending" }, { $set: { status: "queued", "recipients.$[recipient].status": "queued" } }, { arrayFilters: [{ "recipient.status": "sending" }] });
  const queued = await WhatsAppCampaign.find({ status: "queued" }).select("_id").limit(20).lean();
  queued.forEach((campaign) => queueCampaign(campaign._id));
}

function campaignSummary(campaign) {
  return { id: String(campaign._id), name: campaign.name, templateId: campaign.templateId, audience: campaign.audience, recipientCount: campaign.recipientCount, sentCount: campaign.sentCount, deliveredCount: campaign.deliveredCount, readCount: campaign.readCount, failedCount: campaign.failedCount, skippedCount: campaign.skippedCount, status: campaign.status, createdAt: campaign.createdAt, completedAt: campaign.completedAt };
}

export async function listCampaigns() {
  const campaigns = await WhatsAppCampaign.find().sort({ createdAt: -1 }).limit(100).lean();
  return campaigns.map(campaignSummary);
}

export async function marketingOverview() {
  const [eligible, totals, recent] = await Promise.all([
    eligibleUsers({ audience: "opted_in_customers" }),
    WhatsAppCampaign.aggregate([{ $group: { _id: null, campaigns: { $sum: 1 }, sent: { $sum: "$sentCount" }, failed: { $sum: "$failedCount" } } }]),
    WhatsAppCampaign.findOne().sort({ createdAt: -1 }).lean(),
  ]);
  return { optedInCustomers: eligible.length, campaigns: totals[0]?.campaigns || 0, sent: totals[0]?.sent || 0, failed: totals[0]?.failed || 0, latestCampaign: recent ? campaignSummary(recent) : null };
}

export async function getCampaign(id) {
  const campaign = await WhatsAppCampaign.findById(id).populate("initiatedBy", "name email").populate("recipients.user", "name phone whatsappOptIn").lean();
  if (!campaign) throw new ApiError("Campaign not found.", 404);
  return { ...campaignSummary(campaign), initiatedBy: campaign.initiatedBy ? { name: campaign.initiatedBy.name, email: campaign.initiatedBy.email } : null, recipients: campaign.recipients.map((item) => ({ customerId: item.user?._id ? String(item.user._id) : null, name: item.user?.name || "Customer", maskedPhone: item.user?.phone ? (() => { try { return maskPhone(item.user.phone); } catch { return "Unavailable"; } })() : "Unavailable", optedIn: item.user?.whatsappOptIn === true, status: item.status, failureCode: item.failureCode, processedAt: item.processedAt })) };
}
