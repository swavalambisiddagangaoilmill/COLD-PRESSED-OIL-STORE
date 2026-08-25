// Dedicated admin authentication API; separate from customer WhatsApp auth.
import { apiRequest } from "../api/apiClient.js";

export const loginAdmin = (payload) => apiRequest("/admin-auth/login", { method: "POST", body: JSON.stringify(payload) });
