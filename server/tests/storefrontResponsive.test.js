import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shop uses two mobile columns for controls and product cards", async () => {
  const shop = await source("../../src/pages/Shop.jsx");
  assert.match(shop, /grid grid-cols-2 gap-3/);
  assert.match(shop, /col-span-2[^\n]*lg:col-span-1/);
  assert.match(shop, /grid grid-cols-2 gap-3\.5/);
});

test("related product carousel keeps container-aligned mobile edges", async () => {
  const related = await source("../../src/components/features/product/RelatedProducts.jsx");
  assert.doesNotMatch(related, /-mx-4/);
  assert.match(related, /overflow-x-auto/);
  assert.match(related, /sm:grid-cols-2/);
});

test("mobile overlays share a reference-counted body scroll lock", async () => {
  const [hook, drawer, search] = await Promise.all([
    source("../../src/hooks/useBodyScrollLock.js"),
    source("../../src/components/layout/MobileDrawer.jsx"),
    source("../../src/components/layout/MobileSearchPanel.jsx"),
  ]);
  assert.match(hook, /lockCount \+= 1/);
  assert.match(hook, /lockCount = Math\.max\(0, lockCount - 1\)/);
  assert.match(hook, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(drawer, /useBodyScrollLock\(open\)/);
  assert.match(search, /useBodyScrollLock\(open\)/);
  assert.doesNotMatch(search, /document\.body\.style\.overflow = ""/);
});
