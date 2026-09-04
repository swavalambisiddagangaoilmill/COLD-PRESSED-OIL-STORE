import { getShippingRate } from "./shiprocketService.js";

export const roundCustomerShipping = (cost) => (Math.floor(Math.max(0, Number(cost) || 0) / 5) + 1) * 5;
export const shipmentWeight = (items = []) => Number(items.reduce((sum, item) => sum + Number(item.litreSize || 1) * Number(item.quantity || 1), 0).toFixed(2));

export async function calculateShippingQuote({ items, deliveryPincode, paymentMethod, declaredValue }) {
  const weight = shipmentWeight(items);
  const courier = await getShippingRate({ deliveryPincode, weight, paymentMethod, declaredValue });
  return { shiprocketShippingCost: courier.shippingCost, customerShippingCharge: roundCustomerShipping(courier.shippingCost), courierId: courier.courierId, courierName: courier.courierName, estimatedDelivery: courier.estimatedDelivery, deliveryPincode: String(deliveryPincode), shipmentWeight: weight };
}
