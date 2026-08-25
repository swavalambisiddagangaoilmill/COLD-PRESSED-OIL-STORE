import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const baseEnv = {
  ...process.env,
  NODE_ENV: "production",
  MONGO_URI: "mongodb+srv://user:password@example.invalid/store",
  JWT_SECRET: "a".repeat(64),
  CLIENT_URL: "https://store.example.com",
  CLIENT_URLS: "https://store.example.com",
  WHATSAPP_MODE: "live",
  SHIPROCKET_MOCK: "false",
};

function loadProductionEnv(overrides = {}) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", "import('./config/env.js')"], {
    cwd: new URL("..", import.meta.url),
    env: { ...baseEnv, ...overrides },
    encoding: "utf8",
  });
}

test("production configuration accepts public HTTPS origins with live integrations", () => {
  const result = loadProductionEnv();
  assert.equal(result.status, 0, result.stderr);
});

test("production configuration rejects localhost origins", () => {
  const result = loadProductionEnv({ CLIENT_URL: "http://localhost:5173", CLIENT_URLS: "http://localhost:5173" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HTTPS public origins/);
});

test("production configuration rejects WhatsApp and shipping mock modes", () => {
  const whatsapp = loadProductionEnv({ WHATSAPP_MODE: "mock" });
  const shipping = loadProductionEnv({ SHIPROCKET_MOCK: "true" });
  assert.notEqual(whatsapp.status, 0);
  assert.match(whatsapp.stderr, /WHATSAPP_MODE=mock/);
  assert.notEqual(shipping.status, 0);
  assert.match(shipping.stderr, /SHIPROCKET_MOCK=true/);
});
