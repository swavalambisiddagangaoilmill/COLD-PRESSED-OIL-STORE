// Dedicated admin authentication API; separate from customer WhatsApp auth.
import { adminRequest as apiRequest } from "../admin/utils/adminError.js";

export const loginAdmin = (payload) => apiRequest("/admin-auth/login", { method: "POST", body: JSON.stringify(payload) });
