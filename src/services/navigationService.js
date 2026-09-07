import { apiRequest } from "../api/apiClient.js";
import { DEFAULT_NAVBAR_CONFIG } from "../../shared/navbarConfig.js";

let cachedPublicNavbar = null;
let publicNavbarRequest = null;

export function getCachedPublicNavbar() {
  return cachedPublicNavbar;
}

export async function getPublicNavbar({ refresh = false } = {}) {
  if (!refresh && cachedPublicNavbar) return cachedPublicNavbar;
  if (!refresh && publicNavbarRequest) return publicNavbarRequest;

  const request = apiRequest("/content/navbar").then((data) => {
    cachedPublicNavbar = data.navbar?.items ? data.navbar : DEFAULT_NAVBAR_CONFIG;
    return cachedPublicNavbar;
  });
  publicNavbarRequest = request;

  try {
    return await request;
  } finally {
    if (publicNavbarRequest === request) publicNavbarRequest = null;
  }
}
