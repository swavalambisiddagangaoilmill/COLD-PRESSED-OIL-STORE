import assert from "node:assert/strict";
import test from "node:test";
import { addVariant, removeVariant } from "../../src/admin/utils/variantForm.js";

const blankVariant = () => ({ name: "", sku: "", images: [], dimensions: { length: "", width: "", height: "" } });

test("adding variants creates independent Variant 2 and Variant 3 records", () => {
  const first = { name: "1L", sku: "GO-1L", images: [{ url: "one.jpg" }], dimensions: { length: 1 } };
  const two = addVariant([first], blankVariant);
  const three = addVariant(two, blankVariant);
  assert.equal(two.length, 2);
  assert.equal(three.length, 3);
  assert.notEqual(three[1], three[2]);
  assert.notEqual(three[1].images, three[2].images);
  assert.notEqual(three[1].dimensions, three[2].dimensions);
});

test("removing Variant 2 renumbers by position and preserves remaining values and images", () => {
  const variants = [
    { name: "1L", sku: "GO-1L", images: [{ url: "one.jpg" }] },
    { name: "5L", sku: "GO-5L", images: [{ url: "five.jpg" }] },
    { name: "16.5L", sku: "GO-165L", images: [{ url: "sixteen.jpg" }] },
  ];
  const remaining = removeVariant(variants, 1);
  assert.deepEqual(remaining.map((variant, index) => ({ heading: `Variant ${index + 1}`, name: variant.name, sku: variant.sku, image: variant.images[0].url })), [
    { heading: "Variant 1", name: "1L", sku: "GO-1L", image: "one.jpg" },
    { heading: "Variant 2", name: "16.5L", sku: "GO-165L", image: "sixteen.jpg" },
  ]);
});
