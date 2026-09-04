import { sizeInLitres } from "../utils/shippingDefaults.js";

export function variantLitres(variant) {
  return Number(variant?.litres || sizeInLitres(variant?.size));
}

export function requiredStockLitres(variant, quantity) {
  return Number((variantLitres(variant) * Math.max(1, Number(quantity) || 1)).toFixed(3));
}

export function availableVariantQuantity(variant, productStockLitres = 0) {
  return Math.floor((Number(productStockLitres || 0) + Number.EPSILON) / variantLitres(variant));
}
