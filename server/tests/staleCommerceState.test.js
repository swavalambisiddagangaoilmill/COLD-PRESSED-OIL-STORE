import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import Product from "../models/Product.js";
import { clearPurchasedCart } from "../services/orderService.js";
import { getCart } from "../services/cartService.js";
import { getWishlist } from "../services/wishlistService.js";
import { normalizeCartItem } from "../../src/services/cartService.js";
import { customerMessage } from "../../src/utils/customerMessage.js";
import { reconcileCartWithCatalog, reconcileWishlistWithCatalog, removePurchasedItems } from "../../src/utils/reconcileGuestCommerce.js";

const originalUpdateOne = User.updateOne;
const originalFindById = User.findById;
const originalProductFind = Product.find;
test.afterEach(() => { User.updateOne = originalUpdateOne; User.findById = originalFindById; Product.find = originalProductFind; });

function mockUserSelection(value) {
  User.findById = () => ({ select: () => ({ lean: async () => value }) });
}

test("cart read removes missing products and clamps valid quantities persistently", async () => {
  mockUserSelection({ cart: [{ product: "valid", quantity: 8 }, { product: "deleted", quantity: 1 }] });
  Product.find = async () => [{ _id: "valid", title: "Valid oil", stock: 3, isActive: true }];
  let update;
  User.updateOne = async (...args) => { update = args; };
  const cart = await getCart("user-1");
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.deepEqual(update[1].cart, [{ product: "valid", quantity: 3 }]);
});

test("wishlist read removes only missing or inactive product references", async () => {
  mockUserSelection({ wishlist: ["valid", "deleted"] });
  Product.find = async () => [{ _id: "valid", title: "Valid oil", isActive: true }];
  let update;
  User.updateOne = async (...args) => { update = args; };
  const wishlist = await getWishlist("user-1");
  assert.deepEqual(wishlist.map((product) => product._id), ["valid"]);
  assert.deepEqual(update[1].wishlist, ["valid"]);
});

test("successful purchase removes only purchased persisted cart references", async () => {
  let operation;
  User.updateOne = async (...args) => { operation = args; };
  await clearPurchasedCart("user-1", ["product-1", "product-2"]);
  assert.deepEqual(operation, [
    { _id: "user-1" },
    { $pull: { cart: { product: { $in: ["product-1", "product-2"] } } } },
  ]);
});

test("cart normalization keeps authoritative stock, active state, and current price", () => {
  const item = normalizeCartItem({ product: { _id: "product-1", title: "Oil", price: 450, discountPrice: 399, stock: 3, isActive: true }, quantity: 2 });
  assert.equal(item.price, 399);
  assert.equal(item.stock, 3);
  assert.equal(item.isActive, true);
  assert.equal(item.quantity, 2);
});

test("guest cart and wishlist retain valid products while removing stale products", () => {
  const saved = [{ id: "valid", price: 100, quantity: 5 }, { id: "deleted", price: 100, quantity: 1 }];
  const catalog = [{ id: "valid", price: 125, stock: 2, isActive: true }];
  assert.deepEqual(reconcileCartWithCatalog(saved, catalog), [{ ...catalog[0], quantity: 2 }]);
  assert.deepEqual(reconcileWishlistWithCatalog(saved, catalog), catalog);
});

test("purchased item removal is selective and idempotent while failed flows preserve cart", () => {
  const cart = [{ id: "purchased", quantity: 1 }, { id: "other", quantity: 2 }];
  const afterSuccess = removePurchasedItems(cart, ["purchased"]);
  assert.deepEqual(afterSuccess, [{ id: "other", quantity: 2 }]);
  assert.deepEqual(removePurchasedItems(afterSuccess, ["purchased"]), afterSuccess);
  assert.deepEqual(removePurchasedItems(cart, []), cart);
});

test("customer messages do not expose raw database errors", () => {
  const message = customerMessage({ status: 409, message: "E11000 duplicate key collection users index cart.product_1" });
  assert.equal(message, "This request has already been processed. Refresh and try again.");
  assert.doesNotMatch(message, /E11000|index|collection/i);
});
