import assert from "node:assert/strict";
import test from "node:test";
import { calculateCheckoutTotals } from "../services/couponService.js";
import { selectCourier } from "../services/shiprocketService.js";
import { roundCustomerShipping, shipmentWeight } from "../services/shippingQuoteService.js";
import Order from "../models/Order.js";

test("variant quantities determine shipment weight", () => {
  assert.equal(shipmentWeight([{ litreSize: 1, quantity: 1 }]), 1);
  assert.equal(shipmentWeight([{ litreSize: 5, quantity: 1 }]), 5);
  assert.equal(shipmentWeight([{ litreSize: 1, quantity: 2 }, { litreSize: 5, quantity: 1 }, { litreSize: 16.5, quantity: 1 }]), 23.5);
});

test("customer shipping rounds upward to the next ten", () => {
  assert.equal(roundCustomerShipping(98), 100);
  assert.equal(roundCustomerShipping(555), 560);
  assert.equal(roundCustomerShipping(601), 610);
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
  const order = new Order({ user: "64b000000000000000000001", products: [], shippingAddress: { fullName: "Customer", phone: "9999999999", street: "Road", city: "City", state: "State", postalCode: "560001" }, totalAmount: 1800, shippingAmount: 100, shiprocketShippingCost: 98, selectedCourierId: 9, selectedCourierService: "Internal courier", deliveryPincode: "560001", shipmentWeight: 5 });
  assert.equal(order.shippingAmount, 100);
  assert.equal(order.shiprocketShippingCost, 98);
  assert.equal(order.selectedCourierService, "Internal courier");
  assert.equal(order.deliveryPincode, "560001");
  assert.equal(order.shipmentWeight, 5);
});
