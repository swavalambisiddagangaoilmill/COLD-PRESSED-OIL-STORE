import Offer from "../models/Offer.js";

const id = (value) => String(value?._id || value || "");
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function isOfferActive(offer, now = new Date()) {
  return offer?.isActive !== false && new Date(offer.startDate) <= now && new Date(offer.endDate) >= now;
}

function targetMatches(offer, product, variantId) {
  if (!offer.targetType) {
    if (offer.scope === "STORE") return true;
    if (offer.scope === "CATEGORY") return id(offer.category) === id(product.category);
    return (offer.products || []).some((value) => id(value) === id(product));
  }
  const category = (offer.categories || []).some((value) => id(value) === id(product.category));
  const selectedProduct = (offer.products || []).some((value) => id(value) === id(product));
  const selectedVariant = (offer.variants || []).some((value) => id(value.product) === id(product) && id(value.variant) === id(variantId));
  if (offer.targetType === "CATEGORY") return category;
  if (offer.targetType === "VARIANT") return selectedVariant;
  return category || selectedProduct || selectedVariant;
}

export function calculateOfferPrice(baseSellingPrice, offer) {
  const base = Number(baseSellingPrice || 0);
  const amount = offer?.discountType === "FIXED" ? Number(offer.discountValue || 0) : base * Number(offer?.discountValue || 0) / 100;
  const discountAmount = roundMoney(Math.min(base, Math.max(0, amount)));
  return { baseSellingPrice: base, discountAmount, effectivePrice: roundMoney(base - discountAmount) };
}

export function bestOfferFor(product, offers, variantId, now = new Date()) {
  return (offers || []).filter((offer) => isOfferActive(offer, now) && targetMatches(offer, product, variantId)).map((offer) => ({ offer, pricing: calculateOfferPrice(variantId ? product.variants?.find((variant) => id(variant) === id(variantId))?.price : product.discountPrice || product.price, offer) })).sort((a, b) => a.pricing.effectivePrice - b.pricing.effectivePrice || new Date(b.offer.updatedAt || 0) - new Date(a.offer.updatedAt || 0) || id(a.offer).localeCompare(id(b.offer)))[0];
}

function offerSnapshot(match) {
  if (!match) return null;
  return { id: id(match.offer), name: match.offer.name, description: match.offer.description || "", percentage: match.offer.discountType === "PERCENTAGE" ? Number(match.offer.discountValue) : null, discountType: match.offer.discountType, discountValue: Number(match.offer.discountValue) };
}

export function priceProduct(productValue, offers, now = new Date()) {
  const product = productValue?.toObject ? productValue.toObject() : { ...productValue };
  const variants = (product.variants || []).map((variant) => {
    const match = bestOfferFor(product, offers, variant._id, now);
    const pricing = match?.pricing || { baseSellingPrice: Number(variant.price), discountAmount: 0, effectivePrice: Number(variant.price) };
    return { ...variant, ...pricing, appliedOffer: offerSnapshot(match) };
  });
  const primaryVariant = variants.find((variant) => variant.size === product.size) || variants[0];
  const match = bestOfferFor(product, offers, primaryVariant?._id, now) || bestOfferFor(product, offers, null, now);
  const baseSellingPrice = Number(primaryVariant?.baseSellingPrice ?? product.discountPrice ?? product.price);
  const pricing = match ? calculateOfferPrice(baseSellingPrice, match.offer) : { baseSellingPrice, discountAmount: 0, effectivePrice: baseSellingPrice };
  return { ...product, variants, ...pricing, appliedOffer: offerSnapshot(match), offerPrice: pricing.effectivePrice };
}

export async function activeOffers(now = new Date()) {
  return Offer.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }).lean();
}

export async function priceProducts(products, now = new Date()) {
  const offers = await activeOffers(now);
  return products.map((product) => priceProduct(product, offers, now));
}
