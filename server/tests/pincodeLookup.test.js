import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { lookupIndianPincode } from "../services/pincodeService.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("PIN lookup returns editable district/state suggestions and every locality", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.postalpincode.in/pincode/572106");
    assert.equal(options.headers.Accept, "application/json");
    return { ok: true, json: async () => [{ Status: "Success", PostOffice: [
      { Name: "Arakere", District: "Tumkur", State: "Karnataka" },
      { Name: "Beladhara", District: "Tumkur", State: "Karnataka" },
      { Name: "Dibbur", District: "Tumkur", State: "Karnataka" },
    ] }] };
  };
  assert.deepEqual(await lookupIndianPincode("572106"), {
    pincode: "572106",
    city: "Tumkur",
    district: "Tumkur",
    state: "Karnataka",
    localities: ["Arakere", "Beladhara", "Dibbur"],
  });
});

test("PIN lookup validates input and fails safely when no postal record exists", async () => {
  await assert.rejects(lookupIndianPincode("57210"), /valid 6-digit/i);
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ Status: "Error", PostOffice: null }] });
  await assert.rejects(lookupIndianPincode("999999"), /enter your city and state manually/i);
});

test("PIN provider failures remain non-sensitive and permit manual address entry", async () => {
  globalThis.fetch = async () => { throw new Error("provider secret detail"); };
  await assert.rejects(lookupIndianPincode("560001"), (error) => {
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /enter your city and state manually/i);
    assert.doesNotMatch(error.message, /secret detail/i);
    return true;
  });
});
