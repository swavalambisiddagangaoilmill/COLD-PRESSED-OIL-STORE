import { ApiError } from "../utils/ApiError.js";
import { requiredStockLitres, variantLitres } from "./variantInventoryService.js";

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ApiError(`${label} is required and must be greater than zero.`, 400);
  return number;
}

function exactDimensions(dimensions = {}) {
  return {
    length: positive(dimensions.length, "Variant length"),
    width: positive(dimensions.width ?? dimensions.breadth, "Variant width"),
    height: positive(dimensions.height, "Variant height"),
  };
}

function primaryDimensions(lines) {
  return [...lines].sort((a, b) => (b.dimensions.length * b.dimensions.width * b.dimensions.height) - (a.dimensions.length * a.dimensions.width * a.dimensions.height))[0].dimensions;
}

export function shipmentDataFromProducts(items = []) {
  if (!items.length) throw new ApiError("At least one shipment item is required.", 400);
  const lines = items.map((item) => {
    const variants = item.product?.variants || [];
    const variant = item.variant
      ? variants.find((entry) => entry.isActive !== false && String(entry._id) === String(item.variant))
      : variants.find((entry) => entry.isActive !== false && entry.size === item.product?.size);
    if (!variant) throw new ApiError("A valid product variant is required for shipping.", 400);
    const quantity = positive(item.quantity, "Quantity");
    return {
      product: item.product._id,
      variant: variant._id,
      variantName: variant.size,
      sku: variant.sku,
      quantity,
      price: Number(item.price ?? variant.price),
      shippingWeight: positive(variant.shippingWeight, "Variant weight"),
      dimensions: exactDimensions(variant.dimensions),
      litreSize: variantLitres(variant),
      requiredStockLitres: requiredStockLitres(variant, quantity),
      image: variant.images?.[0]?.url || item.product.images?.[0]?.url,
    };
  });
  return { lines, weight: Number(lines.reduce((sum, line) => sum + line.shippingWeight * line.quantity, 0).toFixed(3)), dimensions: primaryDimensions(lines) };
}

export function shipmentDataFromOrder(order) {
  const lines = (order.products || []).map((item) => ({
    shippingWeight: positive(item.shippingWeight, "Order variant weight"),
    dimensions: exactDimensions(item.dimensions),
    quantity: positive(item.quantity, "Order item quantity"),
  }));
  if (!lines.length) throw new ApiError("Order shipment snapshot is missing.", 400);
  return { lines, weight: Number(lines.reduce((sum, line) => sum + line.shippingWeight * line.quantity, 0).toFixed(3)), dimensions: order.shipmentDimensions ? exactDimensions(order.shipmentDimensions) : primaryDimensions(lines) };
}
