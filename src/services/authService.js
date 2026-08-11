// Handles frontend authentication API calls.
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import { apiRequest, clearAuthTokens, setAuthTokens } from "../api/apiClient.js";

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


export function requestLoginOtp(payload) {
  return apiRequest(API_ENDPOINTS.auth.otpRequest, { method: "POST", body: JSON.stringify(payload) });
}

export function resendLoginOtp(payload) {
  return apiRequest(API_ENDPOINTS.auth.otpResend, { method: "POST", body: JSON.stringify(payload) });
}

export async function verifyLoginOtp(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.otpVerify, { method: "POST", body: JSON.stringify(payload) });
  if (data.token) setAuthTokens(data.token, data.refreshToken);
  return data;
}
export async function continueAdminLogin(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.continueAdminLogin, { method: "POST", body: JSON.stringify(payload) });
  setAuthTokens(data.token, data.refreshToken);
  return data;
}

export async function registerAccount(payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.register, { method: "POST", body: JSON.stringify(payload) });
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
export function forgotPasswordRequest(payload) {
  return apiRequest(API_ENDPOINTS.auth.forgotPassword, { method: "POST", body: JSON.stringify(payload) });
}

export async function resetPasswordRequest(token, payload) {
  const data = await apiRequest(API_ENDPOINTS.auth.resetPassword(token), { method: "POST", body: JSON.stringify(payload) });
  setAuthTokens(data.token, data.refreshToken);
  return data;
}

export function verifyEmailRequest(token) {
  return apiRequest(API_ENDPOINTS.auth.verifyEmail(token));
}
