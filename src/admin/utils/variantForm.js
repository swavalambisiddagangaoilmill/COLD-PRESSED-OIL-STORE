// Immutable helpers for the admin product variant editor.
export function addVariant(variants, createBlankVariant) {
  return [...variants, createBlankVariant()];
}

export function removeVariant(variants, indexToRemove) {
  return variants.filter((_, index) => index !== indexToRemove);
}
