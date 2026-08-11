// Sends customer OTPs through MSG91 or a development-only mock provider.
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { isServiceAvailable, logExternalFailure } from "../serviceStatusService.js";

function canUseMockOtp() {
  return !env.isProduction && (!env.otp.msg91AuthKey || !env.otp.msg91TemplateId);
}

export async function sendCustomerOtp(phone, otp) {
  if (canUseMockOtp()) return { provider: "mock", mocked: true };
  if (!isServiceAvailable("msg91")) throw new ApiError("OTP service is temporarily unavailable.", 503);
  if (env.otp.provider !== "msg91") throw new ApiError("OTP service is not configured.", 503);
  if (!env.otp.msg91AuthKey || !env.otp.msg91TemplateId) throw new ApiError("OTP service is temporarily unavailable.", 503);

  const query = new URLSearchParams({ template_id: env.otp.msg91TemplateId, mobile: phone.replace(/^\+/, ""), authkey: env.otp.msg91AuthKey, otp });
  if (env.otp.msg91SenderId) query.set("sender", env.otp.msg91SenderId);
  let response;
  try {
    response = await fetch(`https://control.msg91.com/api/v5/otp?${query.toString()}`, { method: "POST" });
  } catch (error) {
    logExternalFailure("msg91", error, { action: "send_otp" });
    throw new ApiError("OTP service is temporarily unavailable.", 503);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.type && payload.type !== "success")) {
    logExternalFailure("msg91", new Error(payload.message || "MSG91 OTP failed"), { status: response.status });
    throw new ApiError("OTP service is temporarily unavailable.", 503);
  }
  return { provider: "msg91" };
}