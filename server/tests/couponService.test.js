import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import { calculateCheckoutTotals, consumeCouponUsage, validateCouponForItems } from "../services/couponService.js";

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

test("expired, future, inactive, exhausted, and minimum-order failures are specific", async () => {
  const dateInIndia = (offsetDays) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + offsetDays * 86400000)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  await assert.rejects(validate(coupon({ expiryDate: dateInIndia(-1) })), /expired/);
  await assert.rejects(validate(coupon({ startDate: dateInIndia(1), expiryDate: dateInIndia(2) })), /not active yet/);
  await assert.rejects(validate(coupon({ isActive: false })), /inactive/);
  await assert.rejects(validate(coupon({ usageLimit: 1, usedCount: 1 })), /usage limit/);
  await assert.rejects(validate(coupon({ minimumOrderAmount: 401 })), /Minimum order/);
});

test("guest validation works and logged-in usage limit is enforced", async () => {
  assert.equal((await validate(coupon())).discountAmount, 200);
  await assert.rejects(validate(coupon(), { userId: "64b000000000000000000004", customerUses: 1 }), /maximum number of times/);
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
  await assert.rejects(consumeCouponUsage(coupon()), /usage limit/);
});
