function plain(value) {
  return value?.toObject ? value.toObject() : { ...value };
}

export function customerProductView(value) {
  const product = plain(value);
  const stock = Number(product.stock || 0);
  product.inStock = stock > 0;
  product.variants = (product.variants || []).map((entry) => {
    const variant = plain(entry);
    variant.isAvailable = variant.isActive !== false && stock >= Number(variant.litres || 0);
    delete variant.sku;
    delete variant.stock;
    delete variant.stockUnit;
    delete variant.shippingWeight;
    delete variant.dimensions;
    return variant;
  });
  delete product.sku;
  delete product.stock;
  delete product.weight;
  delete product.dimensions;
  return product;
}

export function customerOrderView(value) {
  const order = plain(value);
  order.products = (order.products || []).map((entry) => {
    const item = plain(entry);
    delete item.variantSku;
    delete item.shippingWeight;
    delete item.dimensions;
    return item;
  });
  for (const field of ["shipmentWeight", "shipmentDimensions", "shiprocketOrderId", "shiprocketShipmentId", "selectedCourierId", "selectedCourierService", "shiprocketShippingCost", "shippingFailureReason", "processedTrackingEvents", "shipmentNotificationEvents", "labelUrl", "manifestUrl", "manifestPrintUrl", "shiprocketInvoiceUrl"]) delete order[field];
  return order;
}
