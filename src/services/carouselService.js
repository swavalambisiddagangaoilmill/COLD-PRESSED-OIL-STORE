import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";

export function getActiveCarousel() {
  return apiRequest(API_ENDPOINTS.carousel)
    .then((data) => data.items || [])
    .catch(async () => {
      const response = await fetch("/carousel/manifest.json", { cache: "no-store" });
      if (!response.ok) return [];
      const items = await response.json();
      return items.map((item, index) => ({
        _id: `local-carousel-${item.file}`,
        title: item.title,
        altText: `${item.title} homepage promotion`,
        imageUrl: `/carousel/${item.file}`,
        order: index + 1,
        isActive: true,
        provider: "local",
      }));
    });
}
