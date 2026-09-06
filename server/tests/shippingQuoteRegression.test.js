import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config/env.js";
import StoreSettings from "../models/StoreSettings.js";
import { calculateShippingQuote } from "../services/shippingQuoteService.js";
import { resetShiprocketAuthForTests } from "../services/shiprocketService.js";

const originalFetch = globalThis.fetch;
const originalFindOne = StoreSettings.findOne;
const originalConfig = { ...env.shiprocket };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const persistedVariant = (id, size, shippingWeight, dimensions) => ({ _id: id, size, litres: Number.parseFloat(size), sku: `SKU-${id}`, price: 500, shippingWeight, dimensions, isActive: true });

test.beforeEach(() => {
  Object.assign(env.shiprocket, { enabled: true, email: "api@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) });
  resetShiprocketAuthForTests();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  StoreSettings.findOne = originalFindOne;
  Object.assign(env.shiprocket, originalConfig);
  resetShiprocketAuthForTests();
});

test("multi-PIN quote matrix preserves authoritative weights, dimensions, and live-rate rounding", async () => {
  const cases = [
    { pin: "572106", weight: 5, rate: 98, paymentMethod: "prepaid" },
    { pin: "572101", weight: 5, rate: 110, paymentMethod: "cod" },
    { pin: "572104", weight: 5, rate: 115, paymentMethod: "prepaid" },
    { pin: "570001", weight: 5, rate: 140, paymentMethod: "prepaid" },
    { pin: "560001", weight: 5, rate: 150, paymentMethod: "cod" },
    { pin: "560034", weight: 5, rate: 158, paymentMethod: "prepaid" },
    { pin: "560066", weight: 15, rate: 438, paymentMethod: "prepaid" },
    { pin: "110001", weight: 15, rate: 601, paymentMethod: "prepaid" },
    { pin: "400001", weight: 15, rate: 555, paymentMethod: "prepaid" },
    { pin: "600001", weight: 5, rate: 220, paymentMethod: "prepaid" },
    { pin: "500001", weight: 5, rate: 205, paymentMethod: "cod" },
    { pin: "700001", weight: 15, rate: 469, paymentMethod: "prepaid" },
  ];
  const requests = [];
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return response(200, { token: "private-token" });
    const request = new URL(url);
    requests.push(request);
    const current = cases.find((entry) => entry.pin === request.searchParams.get("delivery_postcode"));
    return response(200, { data: { available_courier_companies: [{ courier_company_id: 7, courier_name: "Provider rate", rate: current.rate, estimated_delivery_days: 3 }] } });
  };

  for (const entry of cases) {
    const dimensions = entry.weight === 5 ? { length: 20, width: 15, height: 30 } : { length: 30, width: 25, height: 40 };
    const variant = persistedVariant(`v-${entry.weight}`, `${entry.weight}L`, entry.weight, dimensions);
    const quote = await calculateShippingQuote({ items: [{ product: { _id: "p1", variants: [variant] }, variant: variant._id, quantity: 1 }], deliveryPincode: entry.pin, paymentMethod: entry.paymentMethod, declaredValue: 500 });
    assert.equal(quote.shiprocketShippingCost, entry.rate);
    assert.equal(quote.customerShippingCharge, Math.ceil(entry.rate / 10) * 10);
    assert.equal(quote.shipmentWeight, entry.weight);
    assert.deepEqual(quote.shipmentDimensions, dimensions);
  }

  assert.deepEqual(requests.map((request) => request.searchParams.get("delivery_postcode")), cases.map((entry) => entry.pin));
  assert.deepEqual(requests.map((request) => request.searchParams.get("weight")), cases.map((entry) => Number(entry.weight).toFixed(3)));
  assert.ok(requests.every((request) => request.searchParams.get("pickup_postcode") === "572106"));
  assert.ok(requests.every((request) => request.searchParams.get("declared_value") === "500"));
  assert.deepEqual(requests.map((request) => request.searchParams.get("cod")), cases.map((entry) => entry.paymentMethod === "cod" ? "1" : "0"));
});

test("invalid PIN and provider failure never return a fallback quote", async () => {
  const variant = persistedVariant("v5", "5L", 5, { length: 20, width: 15, height: 30 });
  const input = (pin) => ({ items: [{ product: { _id: "p1", variants: [variant] }, variant: "v5", quantity: 1 }], deliveryPincode: pin, paymentMethod: "prepaid", declaredValue: 500 });
  await assert.rejects(calculateShippingQuote(input("123")), /Shipping charges could not be calculated/);

  globalThis.fetch = async (url) => url.endsWith("/auth/login")
    ? response(200, { token: "private-token" })
    : response(200, { data: { available_courier_companies: [] } });
  await assert.rejects(calculateShippingQuote(input("999999")), /Shipping is not available for this PIN code/);
});
