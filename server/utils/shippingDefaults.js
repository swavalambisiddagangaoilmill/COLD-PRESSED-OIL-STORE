import { ApiError } from "./ApiError.js";

const packedWeights = new Map([
  [0.25, 0.3],
  [0.5, 0.55],
  [0.75, 0.8],
  [1, 1],
  [2, 2.1],
  [5, 5],
  [10, 10.5],
  [16.5, 16.5],
]);

export function sizeInLitres(size) {
  const match = String(size || "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(ml|l|litre|litres|liter|liters)$/);
  if (!match) throw new ApiError("Size must be a positive value in ml or L.", 400);
  const amount = Number(match[1]);
  const litres = match[2] === "ml" ? amount / 1000 : amount;
  if (!Number.isFinite(litres) || litres <= 0) throw new ApiError("Size must be a positive value in ml or L.", 400);
  return litres;
}

export function packedWeightForSize(size) {
  const litres = sizeInLitres(size);
  return packedWeights.get(litres) || Number((litres * 1.04).toFixed(3));
}

export function packageDimensionsForSize(size) {
  const litres = sizeInLitres(size);
  if (litres === 1) return { length: 10, width: 10, height: 30 };
  if (litres === 5) return { length: 20, width: 15, height: 30 };
  if (litres === 16.5) return { length: 30, width: 25, height: 30 };

  const scale = Math.cbrt(litres);
  return {
    length: Math.max(8, Math.round(10 * scale)),
    width: Math.max(8, Math.round(10 * scale)),
    height: Math.max(15, Math.round(30 * scale)),
  };
}
