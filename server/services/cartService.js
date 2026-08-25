import User from "../models/User.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";

const qty = (value) => Math.max(1, Number(value) || 1);
const cartKey = (product, variant) => `${product}:${variant}`;
function getVariant(product, id) {
  const variant = product?.variants?.id(id);
  if (!variant || !variant.isActive || variant.isArchived) throw new ApiError("Product variant is unavailable.", 400);
  return variant;
}
async function populatedCart(userId) {
  const user = await User.findById(userId).populate("cart.product");
  if (!user) throw new ApiError("User not found.", 404);
  return user.cart.flatMap((item) => {
    const variant = item.product?.variants?.id(item.variant);
    return item.product && variant ? [{ product: item.product, variant, variantId: variant._id, quantity: item.quantity }] : [];
  });
}
export const getCart = populatedCart;
export function mergeRequestedCartItems(existingItems = [], incomingItems = []) {
  const merged = new Map();
  for (const item of [...existingItems, ...incomingItems]) {
    const productId = item.productId || item.product || item.id;
    const variantId = item.variantId || item.variant?._id || item.variant;
    if (!productId || !variantId) continue;
    const key = cartKey(productId, variantId);
    const current = merged.get(key) || { productId: String(productId), variantId: String(variantId), quantity: 0 };
    current.quantity += qty(item.quantity);
    merged.set(key, current);
  }
  return merged;
}
export async function syncCart(userId, items = [], { merge = false } = {}) {
  const user = await User.findById(userId).select("cart");
  if (!user) throw new ApiError("User not found.", 404);
  const merged = mergeRequestedCartItems(merge ? user.cart : [], items);
  const products = await Product.find({ _id: { $in: [...merged.values()].map((item) => item.productId) }, isActive: true });
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  user.cart = [...merged.values()].map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new ApiError("One or more products are unavailable.", 400);
    const variant = getVariant(product, item.variantId);
    if (variant.stock < item.quantity) throw new ApiError(`${product.title} ${variant.name} has only ${variant.stock} in stock.`, 400);
    return { product: product._id, variant: variant._id, quantity: item.quantity };
  });
  await user.save();
  return populatedCart(userId);
}
export async function addCartItem(userId, productId, variantId, quantity = 1) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const variant = getVariant(product, variantId);
  const user = await User.findById(userId);
  if (!user) throw new ApiError("User not found.", 404);
  const existing = user.cart.find((item) => String(item.product) === String(productId) && String(item.variant) === String(variantId));
  const next = (existing?.quantity || 0) + qty(quantity);
  if (variant.stock < next) throw new ApiError(`${product.title} ${variant.name} has only ${variant.stock} in stock.`, 400);
  if (existing) existing.quantity = next; else user.cart.push({ product: productId, variant: variantId, quantity: next });
  await user.save();
  return populatedCart(userId);
}
export async function updateCartItem(userId, productId, variantId, quantity) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const variant = getVariant(product, variantId);
  const user = await User.findById(userId);
  const existing = user?.cart.find((item) => String(item.product) === String(productId) && String(item.variant) === String(variantId));
  if (!existing) throw new ApiError("Cart item not found.", 404);
  const next = qty(quantity);
  if (variant.stock < next) throw new ApiError(`${product.title} ${variant.name} has only ${variant.stock} in stock.`, 400);
  existing.quantity = next;
  await user.save();
  return populatedCart(userId);
}
export async function removeCartItem(userId, productId, variantId) {
  await User.findByIdAndUpdate(userId, { $pull: { cart: { product: productId, variant: variantId } } });
  return populatedCart(userId);
}
export async function clearCart(userId) { await User.findByIdAndUpdate(userId, { cart: [] }); return []; }
