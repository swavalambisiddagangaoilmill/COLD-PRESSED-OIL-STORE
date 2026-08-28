// Payment controller handles Cashfree payment operations.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { createPaymentOrder, processCashfreeWebhook, verifyPaymentAndCreateOrder } from "../services/paymentService.js";

export const createPaymentIntent = asyncHandler(async (req, res) => {
  const payment = await createPaymentOrder(req.user._id, req.body);
  sendSuccess(res, 200, "Payment checkout created successfully", { payment });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const result = await verifyPaymentAndCreateOrder(req.user._id, req.body.checkoutId);
  sendSuccess(res, result.order ? 201 : 200, result.order ? "Payment verified and order created successfully" : "Payment is not yet complete", result);
});

export const cashfreeWebhook = asyncHandler(async (req, res) => {
  const result = await processCashfreeWebhook(req.body, req.headers);
  sendSuccess(res, 200, "Webhook processed", result);
});
