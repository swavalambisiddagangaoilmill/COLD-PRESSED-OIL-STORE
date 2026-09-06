import { ApiError } from "../utils/ApiError.js";

const PINCODE_API_BASE = "https://api.postalpincode.in/pincode";
const LOOKUP_TIMEOUT_MS = 5_000;

export async function lookupIndianPincode(pincode) {
  const pin = String(pincode || "").trim();
  if (!/^\d{6}$/.test(pin)) throw new ApiError("Enter a valid 6-digit PIN code.", 400);

  let response;
  try {
    response = await fetch(`${PINCODE_API_BASE}/${encodeURIComponent(pin)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("PIN code lookup is temporarily unavailable. Enter your city and state manually.", 503);
  }
  if (!response.ok) throw new ApiError("PIN code lookup is temporarily unavailable. Enter your city and state manually.", 503);

  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError("PIN code lookup is temporarily unavailable. Enter your city and state manually.", 503); }
  const result = Array.isArray(payload) ? payload[0] : null;
  const offices = Array.isArray(result?.PostOffice) ? result.PostOffice : [];
  if (String(result?.Status).toLowerCase() !== "success" || !offices.length) throw new ApiError("No postal location was found for this PIN code. Enter your city and state manually.", 404);

  const first = offices[0];
  return {
    pincode: pin,
    city: String(first.District || first.Division || first.Block || first.Name || "").trim(),
    district: String(first.District || "").trim(),
    state: String(first.State || "").trim(),
    localities: [...new Set(offices.map((office) => String(office?.Name || "").trim()).filter(Boolean))],
  };
}
