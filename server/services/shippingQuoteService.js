import { getShippingRate } from "./shiprocketService.js";
import { shipmentDataFromProducts } from "./shipmentDataService.js";

export const roundCustomerShipping = (cost) => Math.ceil(Math.max(0, Number(cost) || 0) / 10) * 10;
export const shipmentWeight = (items = []) => shipmentDataFromProducts(items).weight;

export async function calculateShippingQuote({ items, deliveryPincode, paymentMethod, declaredValue }) {
  const shipment = shipmentDataFromProducts(items);
  const courier = await getShippingRate({ deliveryPincode, weight: shipment.weight, dimensions: shipment.dimensions, paymentMethod, declaredValue });
  return { shiprocketShippingCost: courier.shippingCost, customerShippingCharge: roundCustomerShipping(courier.shippingCost), courierId: courier.courierId, courierName: courier.courierName, estimatedDelivery: courier.estimatedDelivery, deliveryPincode: String(deliveryPincode), shipmentWeight: shipment.weight, shipmentDimensions: shipment.dimensions };
}
