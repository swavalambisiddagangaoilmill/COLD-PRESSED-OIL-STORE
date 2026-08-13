// Handles cart API calls.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

function normalizeCartItem(item) {
  const product = item.product || item;
  return { ...(product || {}), id: product?._id || product?.id, name: product?.title || product?.name, image: product?.images?.[0]?.url || product?.image || "", price: product?.discountPrice || product?.price || 0, mrp: product?.price || product?.mrp || 0, quantity: item.quantity || 1, category: product?.category?.name || product?.category || "Oil", volume: product?.volume || "1L", codEnabled: product?.codEnabled !== false, onlinePaymentEnabled: product?.onlinePaymentEnabled !== false, returnEligible: product?.returnEligible !== false, exchangeEligible: Boolean(product?.exchangeEligible) };
}

export async function fetchCart() {
  const data = await apiRequest(API_ENDPOINTS.cart);
  return (data.cart || []).map(normalizeCartItem);
}

export async function syncCart(items, { merge = false } = {}) {
  const data = await apiRequest(API_ENDPOINTS.cartSync, { method: "PUT", body: JSON.stringify({ merge, items: items.map((item) => ({ productId: item._id || item.id, quantity: item.quantity })) }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function addCartItem(productId, quantity = 1) {
  const data = await apiRequest(API_ENDPOINTS.cartItems, { method: "POST", body: JSON.stringify({ productId, quantity }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function updateCartItem(productId, quantity) {
  const data = await apiRequest(API_ENDPOINTS.cartItem(productId), { method: "PUT", body: JSON.stringify({ quantity }) });
  return (data.cart || []).map(normalizeCartItem);
}

export async function removeCartItem(productId) {
  const data = await apiRequest(API_ENDPOINTS.cartItem(productId), { method: "DELETE" });
  return (data.cart || []).map(normalizeCartItem);
}

export async function clearCartApi() {
  const data = await apiRequest(API_ENDPOINTS.cart, { method: "DELETE" });
  return data.cart || [];
}

