import { ApiError } from "../utils/ApiError.js";

export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  placed: Object.freeze(["confirmed", "cancelled"]),
  confirmed: Object.freeze(["packed", "cancelled"]),
  packed: Object.freeze(["shipped", "cancelled"]),
  shipped: Object.freeze(["delivered"]),
  delivered: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export function assertOrderStatusTransition(currentStatus, nextStatus) {
  if (!ORDER_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    throw new ApiError("Invalid order status transition.", 400);
  }
  return nextStatus;
}
