import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { clearPurchasedCart, createOrder } from "../services/orderService.js";
import { getCart } from "../services/cartService.js";
import { getWishlist } from "../services/wishlistService.js";
import { normalizeCartItem } from "../../src/services/cartService.js";
import { checkoutMessage, customerMessage } from "../../src/utils/customerMessage.js";
import { reconcileCartWithCatalog, reconcileWishlistWithCatalog, removePurchasedItems } from "../../src/utils/reconcileGuestCommerce.js";

const originalUpdateOne = User.updateOne;
const originalFindById = User.findById;
const originalProductFind = Product.find;
const originalProductUpdate = Product.updateOne;
const originalOrderCreate = Order.create;
test.afterEach(() => { User.updateOne = originalUpdateOne; User.findById = originalFindById; Product.find = originalProductFind; Product.updateOne = originalProductUpdate; Order.create = originalOrderCreate; });

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
  User.updateOne = async (...args) => { operation = args; return { matchedCount: 1 }; };
  await clearPurchasedCart("user-1", ["product-1", "product-2"]);
  assert.deepEqual(operation, [
    { _id: "user-1" },
    { $pull: { cart: { product: { $in: ["product-1", "product-2"] } } } },
  ]);
});

test("cart cleanup failure after order persistence never rolls inventory back or creates another order", async () => {
  const product = { _id: { toString: () => "product-1" }, title: "Oil", stock: 5, price: 500, category: "category-1", codEnabled: true, images: [] };
  Product.find = async () => [product];
  const stockWrites = [];
  Product.updateOne = async (...args) => { stockWrites.push(args); return { modifiedCount: 1 }; };
  let createCalls = 0;
  Order.create = async (value) => { createCalls += 1; return { ...value, _id: "order-1" }; };
  User.updateOne = async () => { throw new Error("cart persistence unavailable"); };

  await assert.rejects(createOrder("user-1", { products: [{ product: "product-1", quantity: 1 }], shippingAddress: {}, paymentMethod: "cod" }), /cart persistence unavailable/);

  assert.equal(createCalls, 1);
  assert.equal(stockWrites.length, 1);
  assert.deepEqual(stockWrites[0][1], { $inc: { stock: -1 } });
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

test("checkout errors distinguish transport, stock, and post-payment cart reconciliation", () => {
  assert.match(checkoutMessage({ status: 0, isNetworkError: true }), /couldn't connect/i);
  assert.doesNotMatch(checkoutMessage({ status: 0 }), /connect|internet/i);
  assert.doesNotMatch(checkoutMessage(new Error("Unexpected frontend exception")), /connect|internet/i);
  assert.match(checkoutMessage({ status: 500, checkoutStage: "cart_preflight" }), /verify your cart/i);
  assert.match(checkoutMessage({ status: 400, checkoutStage: "payment_intent" }), /start the payment/i);
  assert.match(checkoutMessage({ checkoutStage: "payment_cancelled" }), /cancelled/i);
  assert.match(checkoutMessage({ status: 409, checkoutStage: "payment_verification" }), /confirm your payment/i);
  assert.match(checkoutMessage({ checkoutStage: "cart_cleanup" }), /order was created/i);
  assert.match(checkoutMessage({ status: 400, message: "One or more products do not have enough stock." }), /requested quantity/i);
  assert.match(checkoutMessage({ status: 409, message: "Customer cart could not be reconciled." }), /order was created/i);
  assert.doesNotMatch(checkoutMessage({ status: 500, message: "MongoServerError E11000" }), /Mongo|E11000/i);
});
