// Handles cart API calls.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

const internalIdentifier = (value) => /^[a-f\d]{24}$/i.test(String(value || "")) || /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(value || ""));

function displayCategory(category) {
  const value = typeof category === "object" && category !== null ? category.name : category;
  return value && !internalIdentifier(value) ? value : "Not specified";
}

export function normalizeCartItem(item) {
  const product = item.product || item;
  const variantId = item.variant?._id || item.variant || item.variantId;
  const variant = product?.variants?.find((value) => String(value._id || value.id) === String(variantId));
  const priced = variant || product;
  const baseSellingPrice = priced?.baseSellingPrice ?? (variant ? variant.price : (product?.discountPrice ?? product?.price)) ?? 0;
  const price = priced?.effectivePrice ?? baseSellingPrice;
  const availableQuantity = variant?.isAvailable === false || product?.inStock === false ? 0 : Number.MAX_SAFE_INTEGER;
  const { sku: _sku, weight: _weight, dimensions: _dimensions, ...safeProduct } = product || {};
  return { ...safeProduct, id: product?._id || product?.id, variantId: variantId || null, cartKey: `${product?._id || product?.id}:${variantId || ""}`, name: product?.title || product?.name, image: priced?.images?.[0]?.url || product?.images?.[0]?.url || product?.image || "", price, effectivePrice: price, baseSellingPrice, mrp: priced?.appliedOffer ? baseSellingPrice : priced?.mrp || baseSellingPrice, stock: availableQuantity, litres: variant?.litres, isActive: product?.isActive !== false && priced?.isActive !== false, quantity: item.quantity || 1, category: displayCategory(product?.category), volume: variant?.size || product?.volume || product?.size || "Not specified", appliedOffer: priced?.appliedOffer || null, codEnabled: product?.codEnabled !== false, onlinePaymentEnabled: product?.onlinePaymentEnabled !== false, returnEligible: product?.returnEligible !== false, exchangeEligible: Boolean(product?.exchangeEligible) };
}

export async function fetchCart() {
  const data = await apiRequest(API_ENDPOINTS.cart);
  return (data.cart || []).map(normalizeCartItem);
}

export async function syncCart(items, { merge = false } = {}) {
  const data = await apiRequest(API_ENDPOINTS.cartSync, { method: "PUT", body: JSON.stringify({ merge, items: items.map((item) => ({ productId: item._id || item.id, variantId: item.variantId, quantity: item.quantity })) }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function addCartItem(productId, quantity = 1, variantId) {
  const data = await apiRequest(API_ENDPOINTS.cartItems, { method: "POST", body: JSON.stringify({ productId, variantId, quantity }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function updateCartItem(productId, quantity, variantId) {
  const data = await apiRequest(`${API_ENDPOINTS.cartItem(productId)}${variantId ? `?variantId=${encodeURIComponent(variantId)}` : ""}`, { method: "PUT", body: JSON.stringify({ quantity }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function removeCartItem(productId, variantId) {
  const data = await apiRequest(`${API_ENDPOINTS.cartItem(productId)}${variantId ? `?variantId=${encodeURIComponent(variantId)}` : ""}`, { method: "DELETE" });
  return (data.cart || []).map(normalizeCartItem);
}

export async function clearCartApi() {
  const data = await apiRequest(API_ENDPOINTS.cart, { method: "DELETE" });
  return data.cart || [];
}

