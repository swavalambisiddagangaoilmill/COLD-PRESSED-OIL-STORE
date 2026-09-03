import assert from "node:assert/strict";
import test from "node:test";
import { packageDimensionsForSize, packedWeightForSize, sizeInLitres } from "../utils/shippingDefaults.js";

test("common product sizes receive deterministic packed weights in kg", () => {
  assert.equal(packedWeightForSize("250ml"), 0.3);
  assert.equal(packedWeightForSize("500 ml"), 0.55);
  assert.equal(packedWeightForSize("750ML"), 0.8);
  assert.equal(packedWeightForSize("1L"), 1);
  assert.equal(packedWeightForSize("2 litres"), 2.1);
  assert.equal(packedWeightForSize("5L"), 5);
  assert.equal(packedWeightForSize("10L"), 10.5);
  assert.equal(packedWeightForSize("16.5L"), 16.5);
});

test("other valid ml and litre sizes use the deterministic fallback", () => {
  assert.equal(sizeInLitres("1250ml"), 1.25);
  assert.equal(packedWeightForSize("1.25L"), 1.3);
});

test("invalid sizes are rejected", () => {
  assert.throws(() => packedWeightForSize("large"), /positive value in ml or L/);
  assert.throws(() => packedWeightForSize("0L"), /positive value in ml or L/);
});

test("required package sizes receive the configured dimensions", () => {
  assert.deepEqual(packageDimensionsForSize("1L"), { length: 10, width: 10, height: 30 });
  assert.deepEqual(packageDimensionsForSize("5L"), { length: 20, width: 15, height: 30 });
  assert.deepEqual(packageDimensionsForSize("16.5L"), { length: 30, width: 25, height: 30 });
});

test("other sizes receive positive deterministic package dimensions", () => {
  const first = packageDimensionsForSize("750ml");
  assert.deepEqual(packageDimensionsForSize("750ml"), first);
  assert.ok(first.length > 0 && first.width > 0 && first.height > 0);
});
