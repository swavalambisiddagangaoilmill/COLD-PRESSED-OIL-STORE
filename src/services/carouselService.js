import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";

export function getActiveCarousel() {
  return apiRequest(API_ENDPOINTS.carousel)
    .then((data) => data.items || [])
    .catch(() => []);
}
