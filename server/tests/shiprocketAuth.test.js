import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config/env.js";
import StoreSettings from "../models/StoreSettings.js";
import { getShippingRate, resetShiprocketAuthForTests } from "../services/shiprocketService.js";

const originalFetch = globalThis.fetch;
const originalFindOne = StoreSettings.findOne;
const originalNow = Date.now;
const originalConfig = { ...env.shiprocket };
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const serviceability = { data: { available_courier_companies: [{ courier_company_id: 7, courier_name: "Live courier", rate: 98, estimated_delivery_days: 2 }] } };
const rateInput = (deliveryPincode = "560091") => ({ deliveryPincode, weight: 6.25, dimensions: { length: 21.5, width: 16.25, height: 32.75 }, paymentMethod: "prepaid", declaredValue: 1200 });

test.beforeEach(() => {
  Object.assign(env.shiprocket, { enabled: true, email: "api@example.com", password: "secret", pickupLocation: "Primary", pickupPostcode: "572106" });
  StoreSettings.findOne = () => ({ select: () => ({ lean: async () => ({ shiprocketEnabled: true }) }) });
  resetShiprocketAuthForTests();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  StoreSettings.findOne = originalFindOne;
  Date.now = originalNow;
  Object.assign(env.shiprocket, originalConfig);
  resetShiprocketAuthForTests();
});

test("authentication succeeds once and a valid token is reused", async () => {
  let authenticationCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) { authenticationCalls += 1; return jsonResponse(200, { token: "private-token" }); }
    return jsonResponse(200, serviceability);
  };
  await getShippingRate(rateInput());
  await getShippingRate(rateInput("560001"));
  assert.equal(authenticationCalls, 1);
});

test("expired cached tokens are refreshed", async () => {
  let now = 1_000_000;
  let authenticationCalls = 0;
  Date.now = () => now;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) { authenticationCalls += 1; return jsonResponse(200, { token: `token-${authenticationCalls}` }); }
    return jsonResponse(200, serviceability);
  };
  await getShippingRate(rateInput());
  now += 10 * 24 * 60 * 60 * 1000;
  await getShippingRate(rateInput());
  assert.equal(authenticationCalls, 2);
});

test("an upstream 401 clears the token and re-authenticates exactly once", async () => {
  let authenticationCalls = 0;
  let rateCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) { authenticationCalls += 1; return jsonResponse(200, { token: `token-${authenticationCalls}` }); }
    rateCalls += 1;
    return rateCalls === 1 ? jsonResponse(401, { message: "Unauthenticated" }) : jsonResponse(200, serviceability);
  };
  const result = await getShippingRate(rateInput());
  assert.equal(result.shippingCost, 98);
  assert.equal(authenticationCalls, 2);
  assert.equal(rateCalls, 2);
});

test("concurrent quotes share authentication without sharing request data", async () => {
  let authenticationCalls = 0;
  const requestedPincodes = [];
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) {
      authenticationCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse(200, { token: "shared-private-token" });
    }
    requestedPincodes.push(new URL(url).searchParams.get("delivery_postcode"));
    return jsonResponse(200, serviceability);
  };
  const pincodes = ["560001", "560002", "560003", "560004", "560005"];
  await Promise.all(pincodes.map((pincode) => getShippingRate(rateInput(pincode))));
  assert.equal(authenticationCalls, 1);
  assert.deepEqual(requestedPincodes.sort(), pincodes);
});

test("authentication failures and tokens are not exposed in errors", async () => {
  globalThis.fetch = async () => jsonResponse(401, { message: "Invalid credentials", token: "must-not-leak" });
  await assert.rejects(getShippingRate(rateInput()), (error) => {
    assert.equal(JSON.stringify(error).includes("must-not-leak"), false);
    assert.equal(String(error.message).includes("secret"), false);
    return true;
  });
});

test("serviceability sends configured pickup PIN, exact weight, and provider-safe dimensions", async () => {
  let requestUrl;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return jsonResponse(200, { token: "private-token" });
    requestUrl = new URL(url);
    return jsonResponse(200, serviceability);
  };
  await getShippingRate(rateInput());
  assert.equal(requestUrl.searchParams.get("pickup_postcode"), "572106");
  assert.equal(requestUrl.searchParams.get("delivery_postcode"), "560091");
  assert.equal(requestUrl.searchParams.get("weight"), "6.250");
  assert.equal(requestUrl.searchParams.get("length"), "22");
  assert.equal(requestUrl.searchParams.get("breadth"), "17");
  assert.equal(requestUrl.searchParams.get("height"), "33");
});

test("rate limiting is preserved and is not retried", async () => {
  let rateCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return jsonResponse(200, { token: "private-token" });
    rateCalls += 1;
    return jsonResponse(429, { message: "Too many requests" });
  };
  await assert.rejects(getShippingRate(rateInput()), (error) => error.statusCode === 429);
  assert.equal(rateCalls, 1);
});

test("a transient authentication failure is retried once", async () => {
  let authenticationCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) {
      authenticationCalls += 1;
      return authenticationCalls === 1 ? jsonResponse(503, { message: "Temporary failure" }) : jsonResponse(200, { token: "private-token" });
    }
    return jsonResponse(200, serviceability);
  };
  assert.equal((await getShippingRate(rateInput())).shippingCost, 98);
  assert.equal(authenticationCalls, 2);
});

test("provider 403 and 4xx failures fail closed without a rate", async () => {
  for (const status of [403, 422]) {
    resetShiprocketAuthForTests();
    globalThis.fetch = async (url) => url.endsWith("/auth/login")
      ? jsonResponse(200, { token: "private-token" })
      : jsonResponse(status, { message: "Provider rejected request" });
    await assert.rejects(getShippingRate(rateInput()), (error) => error.statusCode === 400);
  }
});

test("provider 5xx is retried once and then fails closed", async () => {
  let rateCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/login")) return jsonResponse(200, { token: "private-token" });
    rateCalls += 1;
    return jsonResponse(503, { message: "Provider unavailable" });
  };
  await assert.rejects(getShippingRate(rateInput()), (error) => error.statusCode === 502);
  assert.equal(rateCalls, 2);
});

test("malformed and unserviceable provider responses never produce zero shipping", async () => {
  const malformed = { ok: true, status: 200, text: async () => "not-json" };
  globalThis.fetch = async (url) => url.endsWith("/auth/login") ? jsonResponse(200, { token: "private-token" }) : malformed;
  await assert.rejects(getShippingRate(rateInput()), (error) => error.statusCode === 502);

  resetShiprocketAuthForTests();
  globalThis.fetch = async (url) => url.endsWith("/auth/login")
    ? jsonResponse(200, { token: "private-token" })
    : jsonResponse(200, { data: { available_courier_companies: [] } });
  await assert.rejects(getShippingRate(rateInput()), /No Shiprocket courier is serviceable/);
});
