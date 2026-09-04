import assert from "node:assert/strict";
import test from "node:test";
import { sizeInLitres } from "../utils/shippingDefaults.js";

test("variant identifiers convert to litres for inventory deductions only", () => {
  assert.equal(sizeInLitres("250ml"), 0.25);
  assert.equal(sizeInLitres("1250ml"), 1.25);
  assert.equal(sizeInLitres("16.5L"), 16.5);
});

test("invalid variant identifiers are rejected", () => {
  assert.throws(() => sizeInLitres("large"), /positive value in ml or L/);
  assert.throws(() => sizeInLitres("0L"), /positive value in ml or L/);
});
