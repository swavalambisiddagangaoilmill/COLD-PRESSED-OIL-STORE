// Storefront promotion APIs for active offers and coupon validation.
import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";

export const COUPON_MESSAGES = Object.freeze({
  COUPON_NOT_FOUND: "Coupon code not found.",
  COUPON_EXPIRED: "This coupon has expired.",
  COUPON_INACTIVE: "This coupon is currently unavailable.",
  COUPON_NOT_STARTED: "This coupon is not active yet.",
  COUPON_USAGE_LIMIT_REACHED: "This coupon has reached its usage limit.",
  COUPON_ALREADY_USED: "You have already used this coupon.",
  COUPON_INVALID_CONFIGURATION: "This coupon cannot be applied right now.",
});

export function getActiveOffers() {
  return apiRequest(API_ENDPOINTS.offers).then((data) => data.offers || []);
}

export function validateCoupon(code, products) {
  return apiRequest(API_ENDPOINTS.couponValidate, { method: "POST", body: JSON.stringify({ code, products }) })
    .then((data) => data.coupon)
    .catch((error) => {
      if (COUPON_MESSAGES[error.reason]) error.message = COUPON_MESSAGES[error.reason];
      throw error;
    });
}
