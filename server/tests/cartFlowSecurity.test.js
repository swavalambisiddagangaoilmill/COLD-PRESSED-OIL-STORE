import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Offer from "../models/Offer.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { getCart, removeCartItem, updateCartItem } from "../services/cartService.js";
import { normalizeCartItem } from "../../src/services/cartService.js";

const productId = "64b000000000000000000001";
const variantId = "64b000000000000000000002";
const original = {
  offerFind: Offer.find,
  productFind: Product.find,
  productFindOne: Product.findOne,
  userExists: User.exists,
  userFindById: User.findById,
  userFindOneAndUpdate: User.findOneAndUpdate,
  userUpdateOne: User.updateOne,
};

test.beforeEach(() => {
  Offer.find = () => ({ lean: async () => [] });
  User.findById = () => ({ select: () => ({ lean: async () => ({ cart: [] }) }) });
  Product.find = async () => [];
  User.exists = async () => true;
  User.updateOne = async () => ({ modifiedCount: 0 });
});

test.afterEach(() => {
  Offer.find = original.offerFind;
  Product.find = original.productFind;
  Product.findOne = original.productFindOne;
  User.exists = original.userExists;
  User.findById = original.userFindById;
  User.findOneAndUpdate = original.userFindOneAndUpdate;
  User.updateOne = original.userUpdateOne;
});

test("legacy null-variant Coconut Oil remains available for quantity updates", async () => {
  Product.findOne = async () => ({ _id: productId, title: "Coconut Oil", isActive: true, stock: 98, price: 500, variants: [] });
  let filter;
  User.findOneAndUpdate = async (value) => { filter = value; return { _id: "customer-1" }; };

  await updateCartItem("customer-1", productId, 2);

  assert.deepEqual(filter, { _id: "customer-1", cart: { $elemMatch: { product: productId, variant: null } } });
});

test("authenticated customer removes only the requested product and variant", async () => {
  let filter;
  let update;
  User.findOneAndUpdate = async (match, mutation) => { filter = match; update = mutation; return { _id: "customer-1" }; };

  const cart = await removeCartItem("customer-1", productId, variantId);

  const identity = { product: productId, variant: variantId };
  assert.deepEqual(filter, { _id: "customer-1", cart: { $elemMatch: identity } });
  assert.deepEqual(update, { $pull: { cart: identity } });
  assert.deepEqual(cart, []);
});

test("legacy null-variant cart row can be removed", async () => {
  let update;
  User.findOneAndUpdate = async (_filter, mutation) => { update = mutation; return { _id: "customer-1" }; };

  await removeCartItem("customer-1", productId);

  assert.deepEqual(update, { $pull: { cart: { product: productId, variant: null } } });
});

test("customer cannot remove a cart item absent from their own cart", async () => {
  User.findOneAndUpdate = async () => null;
  await assert.rejects(
    () => removeCartItem("customer-2", productId, variantId),
    (error) => error.statusCode === 404 && /Cart item not found/i.test(error.message)
  );
});

test("genuinely unavailable product remains blocked", async () => {
  Product.findOne = async () => null;
  await assert.rejects(
    () => updateCartItem("customer-1", productId, 1),
    (error) => error.statusCode === 404 && /Product not found/i.test(error.message)
  );
});

test("cart response populates the category display label", async () => {
  User.findById = () => ({ select: () => ({ lean: async () => ({ cart: [{ product: productId, variant: null, quantity: 1 }] }) }) });
  let populated;
  Product.find = () => ({ populate: async (path, fields) => {
    populated = { path, fields };
    return [{ _id: productId, title: "Coconut Oil", category: { name: "Coconut Oil" }, price: 500, stock: 98, variants: [] }];
  } });

  const cart = await getCart("customer-1");

  assert.deepEqual(populated, { path: "category", fields: "name slug" });
  assert.equal(cart[0].product.category.name, "Coconut Oil");
});

test("cart display normalization suppresses raw identifiers and SKU fields", () => {
  const item = normalizeCartItem({ product: { _id: productId, title: "Coconut Oil", category: "6a9bb03d1cafcc29c9af6aa6", sku: "COCONUT-INTERNAL", price: 500, inStock: true }, quantity: 1 });
  assert.equal(item.category, "Not specified");
  assert.equal(item.sku, undefined);
  assert.equal(item.name, "Coconut Oil");
});

test("cart UI prevents duplicate removal while retaining internal checkout references", async () => {
  const cartSource = await readFile(new URL("../../src/pages/Cart.jsx", import.meta.url), "utf8");
  const checkoutSource = await readFile(new URL("../../src/components/features/cart/CheckoutForm.jsx", import.meta.url), "utf8");
  assert.match(cartSource, /removingRef\.current\.has\(key\)/);
  assert.match(cartSource, /disabled=\{removing\.has/);
  assert.doesNotMatch(cartSource, />\s*\{item\.(?:id|_id|variantId|sku)\}\s*</);
  assert.match(checkoutSource, /product: item\._id \|\| item\.id/);
  assert.match(checkoutSource, /variant: item\.variantId \|\| undefined/);
});
