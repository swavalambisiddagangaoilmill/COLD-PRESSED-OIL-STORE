export const PRODUCT_CATEGORIES = Object.freeze([
  "Flax Seed Oil",
  "Safflower Oil",
  "Sunflower Oil",
  "Coconut Oil",
  "Castor Oil",
  "Badam Oil",
  "White Sesame Oil",
  "Black Sesame Oil",
  "Niger Seed Oil",
  "Mustard Oil",
  "Groundnut Oil",
  "Neem Oil",
  "Herbal Oil",
  "Caranja Oil",
]);

export const PRODUCT_CATEGORY_SLUGS = Object.freeze(PRODUCT_CATEGORIES.map((name) => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
})));

export const PRODUCT_CATEGORY_NAMES = new Set(PRODUCT_CATEGORIES);
export const PRODUCT_CATEGORY_SLUG_SET = new Set(PRODUCT_CATEGORY_SLUGS.map(({ slug }) => slug));

export function isCanonicalProductCategory(name, slug) {
  return PRODUCT_CATEGORY_SLUGS.some((category) => category.name === name && category.slug === slug);
}
