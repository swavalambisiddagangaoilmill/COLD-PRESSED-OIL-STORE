// Handles frontend authentication API calls.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest, clearAuthTokens, getRefreshToken, setAuthTokens } from "../api/apiClient.js";

let pendingRefresh = null;

export async function loginAccount(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.login, { method: "POST", body: JSON.stringify(payload) });
  if (data.token) setAuthTokens(data.token, data.refreshToken);
  return data;
}

export async function googleLoginAccount(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.google, { method: "POST", body: JSON.stringify(payload) });
  setAuthTokens(data.token, data.refreshToken);
  return data;
}
export function requestCustomerOtp(payload) {
  return apiRequest(API_ENDPOINTS.auth.otpRequest, { method: "POST", body: JSON.stringify(payload) });
}
export async function verifyCustomerOtp(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.otpVerify, { method: "POST", body: JSON.stringify(payload) });
  setAuthTokens(data.token, data.refreshToken);
  return data;
}
export async function continueAdminLogin(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.continueAdminLogin, { method: "POST", body: JSON.stringify(payload) });
  setAuthTokens(data.token, data.refreshToken);
  return data;
}

export async function logoutAccount() {
  try {
    await apiRequest(API_ENDPOINTS.auth.logout, { method: "POST" });
  } finally {
    clearAuthTokens();
  }
}

export function getProfile() {
  return apiRequest(API_ENDPOINTS.auth.profile);
}

export function refreshAccount() {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = apiRequest(API_ENDPOINTS.auth.refresh, {
    method: "POST",
    body: JSON.stringify({ refreshToken: getRefreshToken() || undefined }),
  }).finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}
