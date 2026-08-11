// Normalizes and validates Indian mobile numbers for auth, orders, and addresses.
import { ApiError } from "./ApiError.js";

export function normalizeIndianPhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  let mobile = digits;
  if (mobile.length === 12 && mobile.startsWith("91")) mobile = mobile.slice(2);
  if (mobile.length === 11 && mobile.startsWith("0")) mobile = mobile.slice(1);
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new ApiError("Enter a valid 10-digit mobile number.", 422, [{ field: "phone", message: "Enter a valid 10-digit mobile number." }]);
  return `+91${mobile}`;
}

export function maskPhone(phone) {
  const normalized = normalizeIndianPhone(phone);
  return `${normalized.slice(0, 3)}******${normalized.slice(-4)}`;
}