import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Offer from "../models/Offer.js";
import { clearPurchasedCart, createOrder, ensureOrderCartCleanup } from "../services/orderService.js";
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
const originalOrderFindOneAndUpdate = Order.findOneAndUpdate;
const originalOrderUpdate = Order.updateOne;
const originalOfferFind = Offer.find;
test.beforeEach(() => { Offer.find = () => ({ lean: async () => [] }); });
test.afterEach(() => { User.updateOne = originalUpdateOne; User.findById = originalFindById; Product.find = originalProductFind; Product.updateOne = originalProductUpdate; Order.create = originalOrderCreate; Order.findOneAndUpdate = originalOrderFindOneAndUpdate; Order.updateOne = originalOrderUpdate; Offer.find = originalOfferFind; });

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
  assert.deepEqual(update[1].$set.cart, [{ product: "valid", quantity: 3 }]);
  assert.deepEqual(update[0].cart, [{ product: "valid", quantity: 8 }, { product: "deleted", quantity: 1 }]);
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

test("successful purchase atomically subtracts exact product and variant quantities", async () => {
  let operation;
  User.updateOne = async (...args) => { operation = args; return { matchedCount: 1 }; };
  await clearPurchasedCart("user-1", [{ product: "product-1", variant: "variant-1", quantity: 2 }, { product: "product-1", variant: "variant-2", quantity: 1 }]);
  assert.deepEqual(operation[0], { _id: "user-1" });
  assert.ok(Array.isArray(operation[1]));
  const serialized = JSON.stringify(operation[1]);
  assert.match(serialized, /variant-1/);
  assert.match(serialized, /variant-2/);
  assert.match(serialized, /\$subtract/);
  assert.match(serialized, /\$filter/);
});

test("duplicate successful completion claims cart cleanup only once", async () => {
  const order = { _id: "order-1", user: "user-1", products: [{ product: "product-1", variant: "variant-1", quantity: 1 }] };
  let claims = 0;
  let cartWrites = 0;
  Order.findOneAndUpdate = async () => (++claims === 1 ? order : null);
  Order.updateOne = async () => ({ modifiedCount: 1 });
  User.updateOne = async () => { cartWrites += 1; return { matchedCount: 1 }; };
  await Promise.all([ensureOrderCartCleanup(order), ensureOrderCartCleanup({ ...order })]);
  assert.equal(cartWrites, 1);
  assert.ok(order.cartCleanupCompletedAt instanceof Date);
});

test("cart cleanup failure after order persistence never rolls inventory back or creates another order", async () => {
  const variant = { _id: "variant-1", size: "1L", litres: 1, price: 500, shippingWeight: 1, dimensions: { length: 5, width: 5, height: 10 }, images: [], isActive: true };
  const product = { _id: { toString: () => "product-1" }, title: "Oil", stock: 5, price: 500, category: "category-1", codEnabled: true, images: [], variants: [variant] };
  Product.find = async () => [product];
  const stockWrites = [];
  Product.updateOne = async (...args) => { stockWrites.push(args); return { modifiedCount: 1 }; };
  let createCalls = 0;
  Order.create = async (value) => { createCalls += 1; return { ...value, _id: "order-1" }; };
  Order.findOneAndUpdate = async () => ({ _id: "order-1", user: "user-1", products: [{ product: "product-1", variant: "variant-1", quantity: 1 }] });
  User.updateOne = async () => { throw new Error("cart persistence unavailable"); };

  const trustedShippingQuote = { shiprocketShippingCost: 98, customerShippingCharge: 100, courierId: 1, courierName: "Test courier", deliveryPincode: "560001", shipmentWeight: 1 };
  await assert.rejects(createOrder("user-1", { products: [{ product: "product-1", variant: "variant-1", quantity: 1 }], shippingAddress: { postalCode: "560001" }, paymentMethod: "cod" }, { trustedShippingQuote }), /cart persistence unavailable/);

  assert.equal(createCalls, 1);
  assert.equal(stockWrites.length, 1);
  assert.deepEqual(stockWrites[0][1], { $inc: { stock: -1 } });
});

test("cart normalization keeps availability, active state, and current price without exposing stock count", () => {
  const item = normalizeCartItem({ product: { _id: "product-1", title: "Oil", price: 450, discountPrice: 399, stock: 3, isActive: true }, quantity: 2 });
  assert.equal(item.price, 399);
  assert.equal(item.stock, Number.MAX_SAFE_INTEGER);
  assert.equal(item.isActive, true);
  assert.equal(item.quantity, 2);
});

test("guest cart and wishlist retain valid products while removing stale products", () => {
  const saved = [{ id: "valid", price: 100, quantity: 5 }, { id: "deleted", price: 100, quantity: 1 }];
  const catalog = [{ id: "valid", price: 125, stock: 2, isActive: true }];
  assert.deepEqual(reconcileCartWithCatalog(saved, catalog), [{ ...catalog[0], quantity: 2 }]);
  assert.deepEqual(reconcileWishlistWithCatalog(saved, catalog), catalog);
});

test("purchased item removal preserves other variants and quantities added after checkout", () => {
  const cart = [{ id: "purchased", variantId: "1L", quantity: 3 }, { id: "purchased", variantId: "5L", quantity: 2 }, { id: "other", quantity: 2 }];
  const purchased = [{ id: "purchased", variantId: "1L", quantity: 2 }];
  const afterSuccess = removePurchasedItems(cart, purchased);
  assert.deepEqual(afterSuccess, [{ id: "purchased", variantId: "1L", quantity: 1 }, { id: "purchased", variantId: "5L", quantity: 2 }, { id: "other", quantity: 2 }]);
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
