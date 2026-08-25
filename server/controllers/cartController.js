// Cart controller exposes authenticated cart operations.
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { addCartItem, clearCart, getCart, removeCartItem, syncCart, updateCartItem } from "../services/cartService.js";

export const getCartHandler = asyncHandler(async (req, res) => {
  const cart = await getCart(req.user._id);
  sendSuccess(res, 200, "Cart fetched successfully", { cart });
});

export const syncCartHandler = asyncHandler(async (req, res) => {
  const cart = await syncCart(req.user._id, req.body.items || [], { merge: req.body.merge === true });
  sendSuccess(res, 200, "Cart synced successfully", { cart });
});

export const addCartItemHandler = asyncHandler(async (req, res) => {
  const cart = await addCartItem(req.user._id, req.body.productId, req.body.variantId, req.body.quantity);
  sendSuccess(res, 200, "Cart updated successfully", { cart });
});

export const updateCartItemHandler = asyncHandler(async (req, res) => {
  const cart = await updateCartItem(req.user._id, req.params.productId, req.body.variantId, req.body.quantity);
  sendSuccess(res, 200, "Cart item updated successfully", { cart });
});

export const removeCartItemHandler = asyncHandler(async (req, res) => {
  const cart = await removeCartItem(req.user._id, req.params.productId, req.query.variantId);
  sendSuccess(res, 200, "Cart item removed successfully", { cart });
});

export const clearCartHandler = asyncHandler(async (req, res) => {
  const cart = await clearCart(req.user._id);
  sendSuccess(res, 200, "Cart cleared successfully", { cart });
});
