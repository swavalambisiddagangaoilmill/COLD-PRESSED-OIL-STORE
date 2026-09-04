import assert from "node:assert/strict";
import test from "node:test";
import { calculateCheckoutTotals } from "../services/couponService.js";
import { assertShiprocketEnabled, selectCourier } from "../services/shiprocketService.js";
import { env } from "../config/env.js";
import { roundCustomerShipping, shipmentWeight } from "../services/shippingQuoteService.js";
import Order from "../models/Order.js";

test("variant quantities determine shipment weight", () => {
  const item = (id, shippingWeight, quantity = 1) => ({ product: { _id: "p", variants: [{ _id: id, size: `${shippingWeight}L`, litres: shippingWeight, shippingWeight, dimensions: { length: 10, width: 11, height: 12 } }] }, variant: id, quantity });
  assert.equal(shipmentWeight([item("1", 1)]), 1);
  assert.equal(shipmentWeight([item("5", 5)]), 5);
  assert.equal(shipmentWeight([item("1", 1, 2), item("5", 5), item("16", 16.5)]), 23.5);
});

test("customer shipping rounds upward to the nearest ten rupees", () => {
  assert.equal(roundCustomerShipping(98), 100);
  assert.equal(roundCustomerShipping(101), 110);
  assert.equal(roundCustomerShipping(555), 560);
  assert.equal(roundCustomerShipping(560), 560);
});

test("disabled Shiprocket safety switch blocks shipping without a fallback", async () => {
  const enabled = env.shiprocket.enabled;
  env.shiprocket.enabled = false;
  await assert.rejects(() => assertShiprocketEnabled(), /temporarily unavailable/);
  env.shiprocket.enabled = enabled;
});

test("courier selection prefers lowest cost and faster near-equal option", () => {
  const selected = selectCourier({ data: { available_courier_companies: [
    { courier_company_id: 1, courier_name: "Slow", freight_charge: 100, estimated_delivery_days: 6 },
    { courier_company_id: 2, courier_name: "Fast", freight_charge: 105, estimated_delivery_days: 2 },
    { courier_company_id: 3, courier_name: "Expensive", freight_charge: 150, estimated_delivery_days: 1 },
  ] } });
  assert.equal(selected.courierId, 2);
  assert.equal(selected.shippingCost, 105);
});

test("offer-priced products, coupon, and shipping form authoritative total", () => {
  const totals = calculateCheckoutTotals([{ price: 1750, quantity: 1 }], 50, 100);
  assert.deepEqual(totals, { subtotal: 1750, shippingAmount: 100, taxAmount: 0, discountAmount: 50, totalAmount: 1800 });
});

test("order snapshot stores the internal Shiprocket quote separately", () => {
  const order = new Order({ user: "64b000000000000000000001", products: [], shippingAddress: { fullName: "Customer", phone: "9999999999", street: "Road", city: "City", state: "State", postalCode: "560001" }, totalAmount: 1800, shippingAmount: 100, shiprocketShippingCost: 98, selectedCourierId: 9, selectedCourierService: "Internal courier", deliveryPincode: "560001", shipmentWeight: 5, shipmentDimensions: { length: 20, width: 15, height: 30 } });
  assert.equal(order.shippingAmount, 100);
  assert.equal(order.shiprocketShippingCost, 98);
  assert.equal(order.selectedCourierService, "Internal courier");
  assert.equal(order.deliveryPincode, "560001");
  assert.equal(order.shipmentWeight, 5);
  assert.deepEqual(order.shipmentDimensions.toObject(), { length: 20, width: 15, height: 30 });
});
