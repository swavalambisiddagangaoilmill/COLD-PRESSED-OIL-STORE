// Payment controller handles Razorpay-compatible payment operations.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { createPaymentOrder, createUpiQrCheckout, processRazorpayWebhook, verifyPaymentAndCreateOrder, verifyUpiQrCheckout } from "../services/paymentService.js";

export const createPaymentIntent = asyncHandler(async (req, res) => {
  const payment = await createPaymentOrder(req.user._id, req.body);
  sendSuccess(res, 200, "Payment order created successfully", { payment });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const order = await verifyPaymentAndCreateOrder(req.user._id, req.body);
  sendSuccess(res, 201, "Payment verified and order created successfully", { order });
});

export const createUpiQrPayment = asyncHandler(async (req, res) => {
  const qr = await createUpiQrCheckout(req.user._id, req.body);
  sendSuccess(res, 201, "UPI QR created successfully", { qr });
});

export const checkUpiQrPayment = asyncHandler(async (req, res) => {
  const result = await verifyUpiQrCheckout(req.user._id, req.params.checkoutId);
  sendSuccess(res, 200, "UPI QR status fetched successfully", result);
});

export const razorpayWebhook = asyncHandler(async (req, res) => {
  const result = await processRazorpayWebhook(req.body, req.get("X-Razorpay-Signature"));
  sendSuccess(res, 200, "Webhook processed", result);
});
