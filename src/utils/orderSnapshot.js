// Historical order amounts must come only from the immutable order-item snapshot.
export function historicalUnitPrice(item) {
  const value = Number(item?.price ?? item?.unitPrice ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function historicalQuantity(item) {
  const value = Number(item?.quantity ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function historicalLineTotal(item) {
  return historicalUnitPrice(item) * historicalQuantity(item);
}
