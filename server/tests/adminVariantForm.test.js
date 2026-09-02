import assert from "node:assert/strict";
import test from "node:test";
import { addVariant, removeVariant } from "../../src/admin/utils/variantForm.js";

const blankVariant = () => ({ size: "", images: [], dimensions: { length: "", width: "", height: "" } });

test("adding product variants creates independent records", () => {
  const first = { size: "1L", images: [{ url: "one.jpg" }], dimensions: { length: 1 } };
  const variants = addVariant(addVariant([first], blankVariant), blankVariant);
  assert.equal(variants.length, 3);
  assert.notEqual(variants[1], variants[2]);
  assert.notEqual(variants[1].images, variants[2].images);
});

test("removing a product variant preserves the remaining values", () => {
  const variants = [{ size: "1L" }, { size: "5L" }, { size: "16.5L" }];
  assert.deepEqual(removeVariant(variants, 1).map((variant) => variant.size), ["1L", "16.5L"]);
});
