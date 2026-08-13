// Cart business logic stored on the authenticated user.
import User from "../models/User.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";

async function populatedCart(userId) {
  const user = await User.findById(userId).populate("cart.product");
  if (!user) throw new ApiError("User not found.", 404);
  return user.cart.filter((item) => item.product).map((item) => ({ product: item.product, quantity: item.quantity }));
}

function requestedQuantity(quantity) {
  return Math.max(1, Number(quantity) || 1);
}

function assertStock(product, quantity) {
  if (product.stock < quantity) throw new ApiError(`${product.title} has only ${product.stock} in stock.`, 400);
}

export async function getCart(userId) {
  return populatedCart(userId);
}

export function mergeRequestedCartItems(existingItems = [], incomingItems = []) {
  const merged = new Map();
  [...existingItems, ...incomingItems].forEach((item) => {
    const product = item.productId || item.product || item.id;
    if (!product) return;
    const key = product.toString();
    merged.set(key, (merged.get(key) || 0) + requestedQuantity(item.quantity));
  });
  return merged;
}

export async function syncCart(userId, items = [], { merge = false } = {}) {
  const user = merge ? await User.findById(userId).select("cart").lean() : null;
  if (merge && !user) throw new ApiError("User not found.", 404);
  const merged = mergeRequestedCartItems(user?.cart || [], items);
  const products = await Product.find({ _id: { $in: [...merged.keys()] }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const cart = [...merged.entries()].map(([productId, quantity]) => {
    const product = productMap.get(productId);
    if (!product) return null;
    assertStock(product, quantity);
    return { product: product._id, quantity };
  }).filter(Boolean);
  await User.findByIdAndUpdate(userId, { cart }, { new: true, runValidators: true });
  return populatedCart(userId);
}

export async function addCartItem(userId, productId, quantity = 1) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const user = await User.findById(userId);
  if (!user) throw new ApiError("User not found.", 404);
  const delta = requestedQuantity(quantity);
  const existing = user.cart.find((item) => item.product.toString() === productId.toString());
  const nextQuantity = (existing?.quantity || 0) + delta;
  assertStock(product, nextQuantity);
  if (existing) existing.quantity = nextQuantity;
  else user.cart.push({ product: productId, quantity: nextQuantity });
  await user.save();
  return populatedCart(userId);
}

export async function updateCartItem(userId, productId, quantity) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const user = await User.findById(userId);
  const existing = user?.cart.find((item) => item.product.toString() === productId.toString());
  if (!existing) throw new ApiError("Cart item not found.", 404);
  const nextQuantity = requestedQuantity(quantity);
  assertStock(product, nextQuantity);
  existing.quantity = nextQuantity;
  await user.save();
  return populatedCart(userId);
}

export async function removeCartItem(userId, productId) {
  await User.findByIdAndUpdate(userId, { $pull: { cart: { product: productId } } });
  return populatedCart(userId);
}

export async function clearCart(userId) {
  await User.findByIdAndUpdate(userId, { cart: [] });
  return [];
}
