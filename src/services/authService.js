import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest, clearAuthTokens } from "../api/apiClient.js";
export const requestOtp = (payload) => apiRequest(API_ENDPOINTS.auth.requestOtp, { method: "POST", body: JSON.stringify(payload) });
export const verifyOtp = (payload) => apiRequest(API_ENDPOINTS.auth.verifyOtp, { method: "POST", body: JSON.stringify(payload) });
export const googleLogin = (credential) => apiRequest(API_ENDPOINTS.auth.google, { method: "POST", body: JSON.stringify({ credential }) });
export async function logoutAccount() { try { await apiRequest(API_ENDPOINTS.auth.logout, { method: "POST" }); } finally { clearAuthTokens(); } }
export const getProfile = () => apiRequest(API_ENDPOINTS.auth.profile);
