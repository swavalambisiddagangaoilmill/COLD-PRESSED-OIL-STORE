import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import WhatsAppCampaign from "../models/WhatsAppCampaign.js";
import { hasPermission } from "../admin/middleware/adminAuth.js";
import { listEligibleCustomers, listMarketingTemplates, previewAudience, previewTemplate } from "../services/whatsappMarketingService.js";

function stubUserFind(items) {
  const original = User.find;
  User.find = () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => items }) }), lean: async () => items }) });
  return () => { User.find = original; };
}

test("only owner administrators receive WhatsApp marketing permissions", () => {
  assert.equal(hasPermission({ role: "admin", adminRole: "OWNER" }, "whatsapp.manage"), true);
  assert.equal(hasPermission({ role: "admin", adminRole: "ORDER_MANAGER" }, "whatsapp.manage"), false);
  assert.equal(hasPermission({ role: "user" }, "whatsapp.read"), false);
});

test("public template metadata excludes Meta template names and accepts only declared variables", () => {
  const templates = listMarketingTemplates();
  assert.equal(templates.length, 1);
  assert.equal("metaName" in templates[0], false);
  assert.match(previewTemplate("marketing_offer", { offer: "10% OFF" }).preview, /10% OFF/);
  assert.throws(() => previewTemplate("unknown", { offer: "10% OFF" }), /approved WhatsApp template/);
  assert.throws(() => previewTemplate("marketing_offer", { offer: "10% OFF", injected: "value" }), /variables are invalid/);
});

test("audience calculation removes opted-out, invalid, and duplicate recipients", async () => {
  const restore = stubUserFind([
    { _id: "64b000000000000000000001", name: "Eligible", phone: "9876543210", whatsappOptIn: true },
    { _id: "64b000000000000000000002", name: "Opted out", phone: "9876543211", whatsappOptIn: false },
    { _id: "64b000000000000000000003", name: "Duplicate", phone: "+91 98765 43210", whatsappOptIn: true },
    { _id: "64b000000000000000000004", name: "Invalid", phone: "123", whatsappOptIn: true },
  ]);
  try { assert.equal((await previewAudience({ audience: "opted_in_customers" })).recipientCount, 1); } finally { restore(); }
});

test("individual-customer lookup returns only masked minimum data", async () => {
  const restore = stubUserFind([{ _id: "64b000000000000000000001", name: "Customer", phone: "9876543210", whatsappOptIn: true }]);
  try {
    const [customer] = await listEligibleCustomers();
    assert.deepEqual(Object.keys(customer).sort(), ["id", "maskedPhone", "name", "whatsappOptIn"]);
    assert.equal(customer.maskedPhone, "+91******3210");
    assert.equal(JSON.stringify(customer).includes("9876543210"), false);
  } finally { restore(); }
});

test("campaign persistence contains no phone or credential fields", () => {
  const paths = WhatsAppCampaign.schema.paths;
  assert.equal(Boolean(paths.phone || paths.accessToken || paths.apiSecret), false);
  assert.equal(paths.idempotencyKey.options.unique, true);
});
