// Cart business logic stored on the authenticated user.
import User from "../models/User.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { priceProducts } from "./offerPricingService.js";
import { availableVariantQuantity, requiredStockLitres, variantLitres } from "./variantInventoryService.js";
import { customerProductView } from "../utils/customerCommerceView.js";

async function populatedCart(userId) {
  const user = await User.findById(userId).select("cart").lean();
  if (!user) throw new ApiError("User not found.", 404);
  const productIds = user.cart.map((item) => item.product).filter(Boolean);
  const productQuery = Product.find({ _id: { $in: productIds }, isActive: true });
  const products = typeof productQuery.populate === "function"
    ? await productQuery.populate("category", "name slug")
    : await productQuery;
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const cart = user.cart.flatMap((item) => {
    const product = productMap.get(item.product?.toString());
    if (!product) return [];
    const variant = item.variant ? product.variants?.id?.(item.variant) : null;
    if (item.variant && (!variant || variant.isActive === false || product.stock < variantLitres(variant))) return [];
    const stock = product.stock;
    if (stock < 1) return [];
    const availableQuantity = variant ? availableVariantQuantity(variant, product.stock) : stock;
    return [{ product: product._id, ...(variant ? { variant: variant._id } : {}), quantity: Math.min(requestedQuantity(item.quantity), availableQuantity) }];
  });
  const changed = cart.length !== user.cart.length || cart.some((item, index) => item.product.toString() !== user.cart[index]?.product?.toString() || String(item.variant || "") !== String(user.cart[index]?.variant || "") || item.quantity !== user.cart[index]?.quantity);
  // Only clean the snapshot we read. A concurrent cart mutation must win instead
  // of being overwritten by stale-item reconciliation.
  if (changed) await User.updateOne({ _id: userId, cart: user.cart }, { $set: { cart } });
  const priced = await priceProducts(cart.map((item) => productMap.get(item.product.toString())));
  const pricedMap = new Map(priced.map((product) => [String(product._id), product]));
  return cart.map((item) => ({ product: customerProductView(pricedMap.get(item.product.toString())), variant: item.variant, quantity: item.quantity }));
}

function requestedQuantity(quantity) {
  return Math.max(1, Number(quantity) || 1);
}

function selectedVariant(product, variantId) {
  if (!variantId) return null;
  const variant = product.variants?.id?.(variantId) || product.variants?.find((item) => String(item._id) === String(variantId));
  if (!variant) throw new ApiError("Selected variant does not belong to this product.", 400);
  if (variant.isActive === false) throw new ApiError("Selected variant is unavailable.", 400);
  return variant;
}

function assertStock(product, quantity, variantId) {
  const variant = selectedVariant(product, variantId);
  const stock = product.stock;
  const required = variant ? requiredStockLitres(variant, quantity) : quantity;
  if (stock < required) throw new ApiError(`${product.title}${variant ? ` · ${variant.size}` : ""} is no longer available in the requested quantity.`, 400);
  return variant;
}

export async function getCart(userId) {
  return populatedCart(userId);
}

export function mergeRequestedCartItems(existingItems = [], incomingItems = []) {
  const merged = new Map();
  [...existingItems, ...incomingItems].forEach((item) => {
    const product = item.productId || item.product || item.id;
    if (!product) return;
    const variant = item.variantId || item.variant;
    const key = `${product}:${variant || ""}`;
    const current = merged.get(key) || { product: product.toString(), variant: variant?.toString?.() || variant, quantity: 0 };
    current.quantity += requestedQuantity(item.quantity);
    merged.set(key, current);
  });
  return merged;
}

export async function syncCart(userId, items = [], { merge = false } = {}) {
  const user = merge ? await User.findById(userId).select("cart").lean() : null;
  if (merge && !user) throw new ApiError("User not found.", 404);
  const merged = mergeRequestedCartItems(user?.cart || [], items);
  const entries = [...merged.values()];
  const products = await Product.find({ _id: { $in: entries.map((item) => item.product) }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const cart = entries.map(({ product: productId, variant, quantity }) => {
    const product = productMap.get(productId);
    if (!product) return null;
    const selected = assertStock(product, quantity, variant);
    return { product: product._id, variant: selected?._id, quantity };
  }).filter(Boolean);
  await User.findByIdAndUpdate(userId, { cart }, { new: true, runValidators: true });
  return populatedCart(userId);
}

export async function addCartItem(userId, productId, quantity = 1, variantId) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const delta = requestedQuantity(quantity);
  const variant = assertStock(product, delta, variantId);
  const stock = variant ? availableVariantQuantity(variant, product.stock) : product.stock;
  const sameItem = { $and: [{ $eq: ["$$item.product", product._id] }, { $eq: [{ $ifNull: ["$$item.variant", null] }, variant?._id || null] }] };
  const user = await User.findOneAndUpdate(
    { _id: userId, $expr: { $lte: [{ $add: [{ $ifNull: [{ $getField: { field: "quantity", input: { $arrayElemAt: [{ $filter: { input: "$cart", as: "item", cond: sameItem } }, 0] } } }, 0] }, delta] }, stock] } },
    [{ $set: { cart: { $cond: [{ $gt: [{ $size: { $filter: { input: "$cart", as: "item", cond: sameItem } } }, 0] }, { $map: { input: "$cart", as: "item", in: { $cond: [sameItem, { product: "$$item.product", variant: "$$item.variant", quantity: { $add: ["$$item.quantity", delta] } }, "$$item"] } } }, { $concatArrays: ["$cart", [{ product: product._id, variant: variant?._id, quantity: delta }]] }] } } }],
    { new: true }
  );
  if (!user) {
    if (!await User.exists({ _id: userId })) throw new ApiError("User not found.", 404);
    throw new ApiError(`${product.title} does not have enough stock.`, 400);
  }
  return populatedCart(userId);
}

export async function updateCartItem(userId, productId, quantity, variantId) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError("Product not found.", 404);
  const nextQuantity = requestedQuantity(quantity);
  const variant = assertStock(product, nextQuantity, variantId);
  const identity = variant
    ? { product: product._id, variant: variant._id }
    : { product: product._id, variant: null };
  const user = await User.findOneAndUpdate(
    { _id: userId, cart: { $elemMatch: identity } },
    { $set: { "cart.$.quantity": nextQuantity } },
    { new: true, runValidators: true }
  );
  if (!user) {
    if (!await User.exists({ _id: userId })) throw new ApiError("User not found.", 404);
    throw new ApiError("Cart item not found.", 404);
  }
  return populatedCart(userId);
}

export async function removeCartItem(userId, productId, variantId) {
  const identity = { product: productId, variant: variantId || null };
  const user = await User.findOneAndUpdate(
    { _id: userId, cart: { $elemMatch: identity } },
    { $pull: { cart: identity } },
    { new: true }
  );
  if (!user) {
    if (!await User.exists({ _id: userId })) throw new ApiError("User not found.", 404);
    throw new ApiError("Cart item not found.", 404);
  }
  return populatedCart(userId);
}

export async function clearCart(userId) {
  await User.findByIdAndUpdate(userId, { cart: [] });
  return [];
}
