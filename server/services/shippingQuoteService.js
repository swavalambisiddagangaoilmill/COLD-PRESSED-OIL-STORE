import { getShippingRate } from "./shiprocketService.js";
import { shipmentDataFromProducts } from "./shipmentDataService.js";
import { ApiError } from "../utils/ApiError.js";

const SHIPPING_CALCULATION_FAILED = "Shipping charges could not be calculated. Please try again.";

export const roundCustomerShipping = (cost) => Math.ceil(Math.max(0, Number(cost) || 0) / 10) * 10;
export const shipmentWeight = (items = []) => shipmentDataFromProducts(items).weight;

export async function calculateShippingQuote({ items, deliveryPincode, paymentMethod, declaredValue }) {
  const shipment = shipmentDataFromProducts(items);
  let courier;
  try {
    courier = await getShippingRate({ deliveryPincode, weight: shipment.weight, dimensions: shipment.dimensions, paymentMethod, declaredValue });
  } catch (error) {
    throw new ApiError(SHIPPING_CALCULATION_FAILED, error?.statusCode === 429 ? 429 : 503);
  }
  return { shiprocketShippingCost: courier.shippingCost, customerShippingCharge: roundCustomerShipping(courier.shippingCost), courierId: courier.courierId, courierName: courier.courierName, estimatedDelivery: courier.estimatedDelivery, deliveryPincode: String(deliveryPincode), shipmentWeight: shipment.weight, shipmentDimensions: shipment.dimensions };
}
