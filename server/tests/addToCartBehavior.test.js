import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("add button uses exact variant quantity and temporary success state", async () => {
  const source = await readFile(new URL("../../src/components/features/product/AddToCartButton.jsx", import.meta.url), "utf8");
  assert.match(source, /getItemQuantity\(product\.id, product\.variantId\)/);
  assert.match(source, /setAddedRecently\(true\)/);
  assert.match(source, /setTimeout\(\(\) => setAddedRecently\(false\), 1400\)/);
  assert.match(source, /This product is already in your cart with quantity \{cartQuantity\}\. Are you sure you want to add it again\?/);
  assert.match(source, /"Add Again"/);
});

test("add button guards the mutation synchronously against rapid double clicks", async () => {
  const source = await readFile(new URL("../../src/components/features/product/AddToCartButton.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(inFlight\.current\) return false/);
  assert.match(source, /inFlight\.current = true/);
  assert.match(source, /finally \{\s*inFlight\.current = false/);
});
