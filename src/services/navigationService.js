import { apiRequest } from "../api/apiClient.js";
import { DEFAULT_NAVBAR_CONFIG } from "../../shared/navbarConfig.js";

export async function getPublicNavbar() {
  const data = await apiRequest("/content/navbar");
  return data.navbar?.items ? data.navbar : DEFAULT_NAVBAR_CONFIG;
}
