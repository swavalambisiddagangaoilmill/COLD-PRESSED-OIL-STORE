import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("checkout presents PIN before editable city, state, and street fields", async () => {
  const checkout = await source("../../src/components/features/cart/CheckoutForm.jsx");
  const pin = checkout.indexOf('label="PIN code"');
  const city = checkout.indexOf('label="City"');
  const state = checkout.indexOf('label="State"');
  const street = checkout.indexOf('label="Street address"');
  assert.ok(pin > 0 && pin < city && city < state && state < street);
  assert.match(checkout, /cityEditedRef\.current = true/);
  assert.match(checkout, /stateEditedRef\.current = true/);
});

test("PIN and shipping requests are abortable and stale shipping responses are generation-guarded", async () => {
  const [checkout, service, client] = await Promise.all([
    source("../../src/components/features/cart/CheckoutForm.jsx"),
    source("../../src/services/checkoutService.js"),
    source("../../src/api/apiClient.js"),
  ]);
  assert.match(checkout, /const requestId = \+\+shippingRequestRef\.current/);
  assert.match(checkout, /requestId === shippingRequestRef\.current/);
  assert.match(checkout, /controller\.abort\(\)/);
  assert.match(service, /signal: options\.signal/);
  assert.match(client, /error\?\.name === "AbortError"/);
});

test("final order address comes from customer-editable form values", async () => {
  const checkout = await source("../../src/components/features/cart/CheckoutForm.jsx");
  for (const field of ["street", "city", "state", "pin"]) assert.match(checkout, new RegExp(`form\\.get\\("${field}"\\)`));
  assert.doesNotMatch(checkout, /shippingAddress\s*=\s*location/);
});

test("COD and online checkout validate the final submitted PIN server-side", async () => {
  const [orders, payments] = await Promise.all([
    source("../validators/orderValidators.js"),
    source("../validators/paymentValidators.js"),
  ]);
  assert.match(orders, /shippingAddress\.postalCode[^\n]+matches\(\/\^\\d\{6\}\$\//);
  assert.match(payments, /shippingAddress\.postalCode[^\n]+matches\(\/\^\\d\{6\}\$\//);
});
