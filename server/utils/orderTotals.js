export function orderItemTotal(item = {}) {
  const saved = item.total ?? item.lineTotal;
  return saved === undefined || saved === null ? Number(item.price || 0) * Number(item.quantity || 1) : Number(saved);
}

export function withOrderTotals(order) {
  if (!order) return order;
  const source = order.toObject ? order.toObject() : { ...order };
  source.products = (source.products || []).map((item) => ({ ...item, total: orderItemTotal(item) }));
  const calculatedSubtotal = source.products.reduce((sum, item) => sum + item.total, 0);
  source.subtotal = source.subtotal ?? calculatedSubtotal;
  source.shippingAmount = source.shippingAmount ?? 0;
  source.couponDiscount = source.couponDiscount ?? source.discountAmount ?? 0;
  source.taxAmount = source.taxAmount ?? 0;
  source.totalAmount = source.totalAmount ?? Math.max(0, source.subtotal + source.shippingAmount + source.taxAmount - source.couponDiscount);
  return source;
}
