import { ApiError } from "./ApiError.js";

export function sizeInLitres(size) {
  const match = String(size || "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(ml|l|litre|litres|liter|liters)$/);
  if (!match) throw new ApiError("Size must be a positive value in ml or L.", 400);
  const amount = Number(match[1]);
  const litres = match[2] === "ml" ? amount / 1000 : amount;
  if (!Number.isFinite(litres) || litres <= 0) throw new ApiError("Size must be a positive value in ml or L.", 400);
  return litres;
}
