// Cart business logic stored on the authenticated user.
import User from "../models/User.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";

async function populatedCart(userId) {
  const user = await User.findById(userId).select("cart").lean();
  if (!user) throw new ApiError("User not found.", 404);
  const productIds = user.cart.map((item) => item.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true, stock: { $gt: 0 } });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const cart = user.cart.flatMap((item) => {
    const product = productMap.get(item.product?.toString());
    if (!product) return [];
    return [{ product: product._id, quantity: Math.min(requestedQuantity(item.quantity), product.stock) }];
  });
  const changed = cart.length !== user.cart.length || cart.some((item, index) => item.product.toString() !== user.cart[index]?.product?.toString() || item.quantity !== user.cart[index]?.quantity);
  // Only clean the snapshot we read. A concurrent cart mutation must win instead
  // of being overwritten by stale-item reconciliation.
  if (changed) await User.updateOne({ _id: userId, cart: user.cart }, { $set: { cart } });
  return cart.map((item) => ({ product: productMap.get(item.product.toString()), quantity: item.quantity }));
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
  const delta = requestedQuantity(quantity);
  const user = await User.findOneAndUpdate(
    { _id: userId, $expr: { $lte: [{ $add: [{ $ifNull: [{ $getField: { field: "quantity", input: { $arrayElemAt: [{ $filter: { input: "$cart", as: "item", cond: { $eq: ["$$item.product", product._id] } } }, 0] } } }, 0] }, delta] }, product.stock] } },
    [{ $set: { cart: { $cond: [{ $in: [product._id, "$cart.product"] }, { $map: { input: "$cart", as: "item", in: { $cond: [{ $eq: ["$$item.product", product._id] }, { product: "$$item.product", quantity: { $add: ["$$item.quantity", delta] } }, "$$item"] } } }, { $concatArrays: ["$cart", [{ product: product._id, quantity: delta }]] }] } } }],
    { new: true }
  );
  if (!user) {
    if (!await User.exists({ _id: userId })) throw new ApiError("User not found.", 404);
    throw new ApiError(`${product.title} does not have enough stock.`, 400);
  }
  return populatedCart(userId);
}

export async function updateCartItem(userId, productId, quantity) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const nextQuantity = requestedQuantity(quantity);
  assertStock(product, nextQuantity);
  const user = await User.findOneAndUpdate(
    { _id: userId, "cart.product": productId },
    { $set: { "cart.$.quantity": nextQuantity } },
    { new: true, runValidators: true }
  );
  if (!user) {
    if (!await User.exists({ _id: userId })) throw new ApiError("User not found.", 404);
    throw new ApiError("Cart item not found.", 404);
  }
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
