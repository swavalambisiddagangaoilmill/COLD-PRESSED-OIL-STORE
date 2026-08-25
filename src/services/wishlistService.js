// Handles wishlist API calls.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest } from "../api/apiClient.js";

function normalize(product) {
  const variant = product.variants?.find((item) => item.isActive !== false && !item.isArchived && item.stock > 0) || product.variants?.find((item) => item.isActive !== false && !item.isArchived);
  return { ...product, id: product._id || product.id, name: product.title || product.name, image: variant?.images?.[0]?.url || "", price: variant?.price || 0, mrp: variant?.mrp || variant?.price || 0, volume: variant?.name || "", selectedVariant: variant };
}

export async function fetchWishlist() {
  const data = await apiRequest(API_ENDPOINTS.wishlist);
  return (data.wishlist || []).map(normalize);
}

export async function addWishlist(productId) {
  const data = await apiRequest(API_ENDPOINTS.wishlist, { method: "POST", body: JSON.stringify({ productId }) });
  return (data.wishlist || []).map(normalize);
}

export async function removeWishlist(productId) {
  const data = await apiRequest(API_ENDPOINTS.wishlistItem(productId), { method: "DELETE" });
  return (data.wishlist || []).map(normalize);
}
