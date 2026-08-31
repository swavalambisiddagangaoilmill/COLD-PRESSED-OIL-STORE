import test from "node:test";
import assert from "node:assert/strict";

test("test mode sends the Meta authentication-template OTP payload", async () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  process.env.NODE_ENV = "development";
  process.env.WHATSAPP_MODE = "test";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  process.env.WHATSAPP_OTP_TEMPLATE_NAME = "authentication";
  process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ messages: [{ id: "message-id" }] }) };
  };

  try {
    const { sendOTP } = await import(`../services/whatsappService.js?otp-test=${Date.now()}`);
    await sendOTP("+919876543210", "123456");

    assert.equal(request.url, "https://graph.facebook.com/v23.0/123456789/messages");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers.Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(request.options.body), {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: {
        name: "authentication",
        language: { code: "en_US" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "123456" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
        ],
      },
    });
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test("Meta failures retain safe provider diagnostics without exposing authorization", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: "Template name does not exist in the translation", type: "OAuthException", code: 132001, error_subcode: 2494073, fbtrace_id: "trace-id" } }),
  });

  try {
    const { safeWhatsAppErrorDetails, sendOTP } = await import(`../services/whatsappService.js?otp-error-test=${Date.now()}`);
    await assert.rejects(sendOTP("+919876543210", "123456"), (error) => {
      const details = safeWhatsAppErrorDetails(error);
      assert.deepEqual(details, {
        provider: "meta",
        status: 400,
        code: 132001,
        type: "OAuthException",
        subcode: 2494073,
        message: "Template name does not exist in the translation",
        fbtraceId: "trace-id",
      });
      assert.equal(JSON.stringify(details).includes("test-token"), false);
      assert.equal(JSON.stringify(details).includes("Authorization"), false);
      return true;
    });
  } finally {
    global.fetch = originalFetch;
  }
});
