const NOT_SPECIFIED = "Not specified";

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function firstPresent(...values) {
  return values.find(present);
}

function specificationValue(specifications, names) {
  if (!specifications || typeof specifications !== "object" || Array.isArray(specifications)) return undefined;
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  return Object.entries(specifications).find(([key, value]) => accepted.has(key.toLowerCase()) && present(value))?.[1];
}

function categoryName(category) {
  return typeof category === "object" && category !== null ? category.name : category;
}

export function productSpecifications(product = {}, selectedVariant = null) {
  const persisted = product.specifications && typeof product.specifications === "object" && !Array.isArray(product.specifications)
    ? product.specifications
    : {};
  const handled = new Set(["volume", "size", "category", "method", "processing", "processing method", "storage", "storage instructions"]);
  const additional = Object.fromEntries(Object.entries(persisted).filter(([key, value]) => !handled.has(key.toLowerCase()) && present(value)));

  return {
    Volume: firstPresent(selectedVariant?.size, selectedVariant?.volume, product.volume, product.size, specificationValue(persisted, ["Volume", "Size"])) ?? NOT_SPECIFIED,
    Category: firstPresent(categoryName(product.category), specificationValue(persisted, ["Category"])) ?? NOT_SPECIFIED,
    Method: firstPresent(product.processingMethod, product.processing, product.method, specificationValue(persisted, ["Method", "Processing", "Processing Method"])) ?? NOT_SPECIFIED,
    Storage: firstPresent(product.storageInstructions, product.storage, specificationValue(persisted, ["Storage", "Storage Instructions"])) ?? NOT_SPECIFIED,
    ...additional,
  };
}

