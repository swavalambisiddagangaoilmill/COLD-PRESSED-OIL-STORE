import test from "node:test";
import assert from "node:assert/strict";
import { productSpecifications } from "../../src/utils/productSpecifications.js";

test("specifications use the selected variant and persisted category", () => {
  const product = {
    category: { _id: "category-1", name: "Safflower Oil" },
    variants: [{ _id: "small", size: "500ml" }, { _id: "large", size: "2L" }],
  };

  assert.deepEqual(productSpecifications(product, product.variants[0]), {
    Volume: "500ml",
    Category: "Safflower Oil",
    Method: "Cold Pressed",
    Storage: "Dry and cool places",
  });
  assert.equal(productSpecifications(product, product.variants[1]).Volume, "2L");
});

test("method and storage use the business-wide presentation values", () => {
  assert.deepEqual(productSpecifications({
    category: "Sesame/Gingelly Oil",
    size: "1L",
    specifications: { Processing: "Wood pressed", "Storage Instructions": "Keep away from sunlight", Origin: "Karnataka" },
  }), {
    Volume: "1L",
    Category: "Sesame/Gingelly Oil",
    Method: "Cold Pressed",
    Storage: "Dry and cool places",
    Origin: "Karnataka",
  });
});

test("missing persisted values use neutral fallbacks instead of invented product data", () => {
  assert.deepEqual(productSpecifications({}), {
    Volume: "Not specified",
    Category: "Not specified",
    Method: "Cold Pressed",
    Storage: "Dry and cool places",
  });
});
