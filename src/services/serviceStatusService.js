// Reads backend integration health so UI can gracefully disable unavailable features.
import { apiRequest } from "../api/apiClient.js";

const fallback = {
  checkedAt: null,
  services: {
    cashfree: { status: "offline", available: false, message: "Online payments are temporarily unavailable." },
    resend: { status: "offline", available: false, message: "Email notifications are temporarily unavailable." },
    whatsapp: { status: "offline", available: false, message: "WhatsApp messaging is temporarily unavailable." },
    cloudinary: { status: "offline", available: false, message: "Image uploads are temporarily unavailable." },
    shiprocket: { status: "offline", available: false, message: "Shipping integration is temporarily unavailable." },
    ai: { status: "offline", available: false, message: "AI assistant is temporarily unavailable." },
  },
};

let cached = null;
let lastFetch = 0;

export async function fetchServiceStatus({ force = false } = {}) {
  if (!force && cached && Date.now() - lastFetch < 60000) return cached;
  try {
    cached = await apiRequest("/service-status");
    lastFetch = Date.now();
    return cached;
  } catch {
    cached = fallback;
    lastFetch = Date.now();
    return cached;
  }
}

export function getFallbackServiceStatus() {
  return cached || fallback;
}
