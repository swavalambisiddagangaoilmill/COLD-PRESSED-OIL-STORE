// Handles cart API calls.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

function normalizeCartItem(item) {
  const product = item.product || item;
  const variant = item.variant || product?.selectedVariant || product?.variants?.[0];
  const productId = product?._id || product?.id;
  const variantId = variant?._id || variant?.id || item.variantId;
  return { ...(product || {}), id: `${productId}:${variantId}`, productId, _id: productId, variantId, selectedVariant: variant, variantName: variant?.name, sku: variant?.sku, name: product?.title || product?.name, image: variant?.images?.[0]?.url || "", price: variant?.price || 0, mrp: variant?.mrp || variant?.price || 0, stock: variant?.stock || 0, quantity: item.quantity || 1, volume: variant?.name || "", codEnabled: product?.codEnabled !== false, onlinePaymentEnabled: product?.onlinePaymentEnabled !== false, returnEligible: product?.returnEligible !== false, exchangeEligible: Boolean(product?.exchangeEligible) };
}

export async function fetchCart() {
  const data = await apiRequest(API_ENDPOINTS.cart);
  return (data.cart || []).map(normalizeCartItem);
}

export async function syncCart(items, { merge = false } = {}) {
  const data = await apiRequest(API_ENDPOINTS.cartSync, { method: "PUT", body: JSON.stringify({ merge, items: items.map((item) => ({ productId: item.productId || item._id, variantId: item.variantId || item.selectedVariant?._id, quantity: item.quantity })) }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function addCartItem(productId, variantId, quantity = 1) {
  const data = await apiRequest(API_ENDPOINTS.cartItems, { method: "POST", body: JSON.stringify({ productId, variantId, quantity }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function updateCartItem(productId, variantId, quantity) {
  const data = await apiRequest(API_ENDPOINTS.cartItem(productId), { method: "PUT", body: JSON.stringify({ variantId, quantity }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function removeCartItem(productId, variantId) {
  const data = await apiRequest(`${API_ENDPOINTS.cartItem(productId)}?variantId=${encodeURIComponent(variantId)}`, { method: "DELETE" });
  return (data.cart || []).map(normalizeCartItem);
}

export async function clearCartApi() {
  const data = await apiRequest(API_ENDPOINTS.cart, { method: "DELETE" });
  return data.cart || [];
}

