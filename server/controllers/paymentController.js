import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { createPaymentOrder, processCashfreeWebhook, verifyPaymentAndCreateOrder } from "../services/paymentService.js";
export const createPaymentIntent = asyncHandler(async (req, res) => sendSuccess(res, 200, "Payment session created successfully", { payment: await createPaymentOrder(req.user._id, req.body) }));
export const verifyPayment = asyncHandler(async (req, res) => sendSuccess(res, 201, "Payment verified and order created successfully", { order: await verifyPaymentAndCreateOrder(req.user._id, req.body) }));
export const cashfreeWebhook = asyncHandler(async (req, res) => sendSuccess(res, 200, "Webhook processed", await processCashfreeWebhook(req.body, req.get("x-webhook-timestamp"), req.get("x-webhook-signature"))));
