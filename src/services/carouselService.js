import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";

export async function getActiveCarousel() {
  try {
    const data = await apiRequest(API_ENDPOINTS.carousel);
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}
