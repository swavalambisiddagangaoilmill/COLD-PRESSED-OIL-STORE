import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import { calculateCheckoutTotals, consumeCouponUsage, COUPON_REASONS, validateCouponForItems } from "../services/couponService.js";

const originalCouponFindOne = Coupon.findOne;
const originalCouponUpdateOne = Coupon.updateOne;
const originalOrderCount = Order.countDocuments;

afterEach(() => {
  Coupon.findOne = originalCouponFindOne;
  Coupon.updateOne = originalCouponUpdateOne;
  Order.countDocuments = originalOrderCount;
});

function coupon(overrides = {}) {
  const dateInIndia = (offsetDays = 0) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + offsetDays * 86400000)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  return {
    _id: "64b000000000000000000001",
    code: "SAVE",
    isActive: true,
    startDate: dateInIndia(),
    expiryDate: dateInIndia(),
    usageLimit: 10,
    usedCount: 0,
    perCustomerUsageLimit: 1,
    minimumOrderAmount: 0,
    maximumDiscountAmount: 0,
    discountType: "PERCENTAGE",
    discountValue: 50,
    scope: "ALL",
    products: [],
    categories: [],
    firstOrderOnly: false,
    ...overrides,
  };
}

const items = [{ product: { _id: "64b000000000000000000002", category: "64b000000000000000000003" }, price: 200, quantity: 2 }];

async function validate(currentCoupon, options = {}) {
  Coupon.findOne = async () => currentCoupon;
  Order.countDocuments = async () => options.customerUses || 0;
  return validateCouponForItems({ code: currentCoupon?.code || "UNKNOWN", userId: options.userId, items, subtotal: options.subtotal });
}

async function expectCouponError(promise, reason, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.reason, reason);
    assert.equal(error.message, message);
    assert.equal(error.statusCode, 400);
    return true;
  });
}

test("active percentage coupon applies immediately without consuming usage", async () => {
  let usageWrites = 0;
  Coupon.updateOne = async () => { usageWrites += 1; return { modifiedCount: 1 }; };
  const result = await validate(coupon());
  assert.equal(result.discountAmount, 200);
  assert.equal(usageWrites, 0);
  assert.equal(calculateCheckoutTotals(items, result.discountAmount).totalAmount, 300);
});

test("fixed coupon respects its maximum discount", async () => {
  const result = await validate(coupon({ discountType: "FIXED", discountValue: 300, maximumDiscountAmount: 125 }));
  assert.equal(result.discountAmount, 125);
});

test("coupon expiring today remains valid for the full IST calendar date", async () => {
  const result = await validate(coupon());
  assert.equal(result.discountAmount, 200);
});

test("coupon failure scenarios return stable reasons and customer-safe messages", async () => {
  const dateInIndia = (offsetDays) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + offsetDays * 86400000)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  await expectCouponError(validate(null), COUPON_REASONS.NOT_FOUND, "Coupon code not found.");
  await expectCouponError(validate(coupon({ startDate: dateInIndia(-2), expiryDate: dateInIndia(-1) })), COUPON_REASONS.EXPIRED, "This coupon has expired.");
  await expectCouponError(validate(coupon({ startDate: dateInIndia(1), expiryDate: dateInIndia(2) })), COUPON_REASONS.NOT_STARTED, "This coupon is not active yet.");
  await expectCouponError(validate(coupon({ isActive: false })), COUPON_REASONS.INACTIVE, "This coupon is currently unavailable.");
  await expectCouponError(validate(coupon({ usageLimit: 1, usedCount: 1 })), COUPON_REASONS.USAGE_LIMIT, "This coupon has reached its usage limit.");
  await expectCouponError(validate(coupon({ minimumOrderAmount: 500 })), COUPON_REASONS.MINIMUM_ORDER, "Add ₹100 more to use this coupon.");
  await expectCouponError(validate(coupon({ discountValue: 0 })), COUPON_REASONS.INVALID_CONFIGURATION, "This coupon cannot be applied right now.");
  await expectCouponError(validate(coupon({ discountType: "PERCENTAGE", discountValue: 101 })), COUPON_REASONS.INVALID_CONFIGURATION, "This coupon cannot be applied right now.");
});

test("guest validation works and logged-in usage limit is enforced", async () => {
  assert.equal((await validate(coupon())).discountAmount, 200);
  await expectCouponError(
    validate(coupon(), { userId: "64b000000000000000000004", customerUses: 1 }),
    COUPON_REASONS.ALREADY_USED,
    "You have already used this coupon.",
  );
});

test("successful order consumption increments usage atomically once", async () => {
  let writes = 0;
  Coupon.updateOne = async (filter, update) => {
    writes += 1;
    assert.deepEqual(filter.usedCount, { $lt: 10 });
    assert.deepEqual(update, { $inc: { usedCount: 1 } });
    return { modifiedCount: 1 };
  };
  await consumeCouponUsage(coupon());
  assert.equal(writes, 1);
});

test("exhausted coupon cannot be consumed by a concurrent order", async () => {
  Coupon.updateOne = async () => ({ modifiedCount: 0 });
  await expectCouponError(consumeCouponUsage(coupon()), COUPON_REASONS.USAGE_LIMIT, "This coupon has reached its usage limit.");
});
