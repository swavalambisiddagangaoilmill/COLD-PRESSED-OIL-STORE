import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function readBackendEnv() {
  const envPath = path.resolve(process.cwd(), "server/.env");
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return env;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return env;
    env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    return env;
  }, {});
}

function backendProxyTarget() {
  const env = readBackendEnv();
  const target = env.VITE_API_PROXY_TARGET || `http://localhost:${env.PORT || 5000}`;
  return target.replace(/\/+$/, "").replace(/\/api$/, "");
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: backendProxyTarget(),
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
