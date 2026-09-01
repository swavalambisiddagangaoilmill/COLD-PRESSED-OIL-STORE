const PRESETS = new Map([
  [1, { weight: 1.05, dimensions: { length: 10, width: 10, height: 30 } }],
  [5, { weight: 5, dimensions: { length: 20, width: 15, height: 30 } }],
  [16.5, { weight: 16.5, dimensions: { length: 30, width: 25, height: 30 } }],
]);

const round = (value, places = 2) => Number(value.toFixed(places));
const formatVolume = (litres) => litres < 1 ? `${round(litres * 1000, 3)}ml` : `${round(litres, 3)}L`;

export function parseVariantVolume(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*(ml|l|litres?|liters?)$/i);
  if (!match) throw new Error("Size must be a positive volume such as 500ml, 1L, or 16.5L.");
  const amount = Number(match[1]);
  const litres = match[2].toLowerCase() === "ml" ? amount / 1000 : amount;
  if (!Number.isFinite(litres) || litres <= 0 || litres > 100) throw new Error("Size must be a positive volume of 100 litres or less.");
  return { litres, normalized: formatVolume(litres) };
}

function estimatedDimensions(litres) {
  const base = litres <= 1
    ? { litres: 1, dimensions: PRESETS.get(1).dimensions }
    : litres <= 5
      ? { litres: 5, dimensions: PRESETS.get(5).dimensions }
      : { litres: 16.5, dimensions: PRESETS.get(16.5).dimensions };
  const scale = Math.cbrt(litres / base.litres);
  return Object.fromEntries(Object.entries(base.dimensions).map(([key, value]) => [key, Math.max(5, round(value * scale, 1))]));
}

export function getVariantShippingDefaults(size) {
  const { litres, normalized } = parseVariantVolume(size);
  const preset = PRESETS.get(litres);
  const weight = preset?.weight ?? round((litres * 0.92) + Math.min(0.8, Math.max(0.1, litres * 0.04)));
  const dimensions = preset?.dimensions ?? estimatedDimensions(litres);
  if (weight <= 0 || Object.values(dimensions).some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Unable to calculate valid shipping defaults for this size.");
  return { name: normalized, volumeLitres: litres, weight, dimensions: { ...dimensions } };
}
