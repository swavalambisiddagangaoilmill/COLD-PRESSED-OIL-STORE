import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateOfferPrice, priceProduct } from "../services/offerPricingService.js";

const now = new Date("2026-09-03T12:00:00Z");
const product = { _id: "p1", category: "c1", price: 1000, discountPrice: undefined, size: "1L", variants: [{ _id: "v1", size: "500ml", price: 600 }, { _id: "v2", size: "1L", price: 1000 }, { _id: "v3", size: "2L", price: 1800 }] };
const offer = (overrides = {}) => ({ _id: "o1", name: "Saving", description: "Fresh savings", discountType: "PERCENTAGE", discountValue: 5, targetType: "CATEGORY", categories: ["c1"], products: [], variants: [], startDate: "2026-09-01", endDate: "2026-09-10", isActive: true, ...overrides });

test("1000 plus 5 percent is 950 and 10 percent is 900 without compounding", () => {
  assert.equal(calculateOfferPrice(1000, offer()).effectivePrice, 950);
  assert.equal(calculateOfferPrice(1000, offer({ discountValue: 10 })).effectivePrice, 900);
});

test("removed, disabled, and expired offers restore the base price", () => {
  assert.equal(priceProduct(product, [], now).effectivePrice, 1000);
  assert.equal(priceProduct(product, [offer({ isActive: false })], now).effectivePrice, 1000);
  assert.equal(priceProduct(product, [offer({ endDate: "2026-09-02" })], now).effectivePrice, 1000);
});

test("category offers cover all variants and exclude unrelated categories", () => {
  assert.deepEqual(priceProduct(product, [offer()], now).variants.map((variant) => variant.effectivePrice), [570, 950, 1710]);
  assert.equal(priceProduct({ ...product, category: "c2" }, [offer()], now).effectivePrice, 1000);
});

test("variant targeting discounts only selected variants and supports multiple selections", () => {
  const variantOffer = offer({ targetType: "VARIANT", categories: [], variants: [{ product: "p1", variant: "v2" }, { product: "p1", variant: "v3" }] });
  assert.deepEqual(priceProduct(product, [variantOffer], now).variants.map((variant) => variant.effectivePrice), [600, 950, 1710]);
});

test("custom targeting matches selected products, categories, and variants only", () => {
  const custom = offer({ targetType: "CUSTOM", categories: ["c2"], products: ["p2"], variants: [{ product: "p1", variant: "v1" }] });
  assert.deepEqual(priceProduct(product, [custom], now).variants.map((variant) => variant.effectivePrice), [570, 1000, 1800]);
  assert.equal(priceProduct({ ...product, _id: "p2", category: "c9" }, [custom], now).effectivePrice, 950);
});

test("multiple categories and the single best overlapping offer are deterministic", () => {
  const multi = offer({ categories: ["c1", "c2"] });
  const best = offer({ _id: "o2", discountValue: 10 });
  assert.equal(priceProduct(product, [multi, best], now).effectivePrice, 900);
});

test("new products and category changes recalculate eligibility dynamically", () => {
  const categoryOffer = offer();
  assert.equal(priceProduct({ ...product, _id: "new" }, [categoryOffer], now).effectivePrice, 950);
  assert.equal(priceProduct({ ...product, category: "c2" }, [categoryOffer], now).effectivePrice, 1000);
});

test("offer updates always calculate from the stored base selling price", () => {
  assert.equal(priceProduct(product, [offer({ discountValue: 5 })], now).effectivePrice, 950);
  assert.equal(priceProduct(product, [offer({ discountValue: 10 })], now).effectivePrice, 900);
});
