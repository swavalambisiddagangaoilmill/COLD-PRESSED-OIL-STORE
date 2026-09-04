// Starts the API server after the database connection is ready.
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { ensureDefaultAdmin } from "./services/defaultAdminService.js";
import { startKeepAlive, stopKeepAlive } from "./services/keepAliveService.js";
import { startServiceStatusMonitor } from "./services/serviceStatusService.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", { message: reason?.message || String(reason), stack: reason?.stack });
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", { message: error.message, stack: error.stack });
});

const server = app.listen(env.port, env.host, () => {
  console.log(`Swavalambi Siddaganga Oil Mill API listening on ${env.host}:${env.port}`);
  console.log(env.shiprocket.enabled ? "Shiprocket enabled for live requests" : "Shiprocket disabled by safety switch");
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down`);
  stopKeepAlive();
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref?.();
  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

try {
  await connectDB();
  await ensureDefaultAdmin();
  startServiceStatusMonitor();
  startKeepAlive();
} catch (error) {
  console.error("Backend initialization failed", { message: error.message });
  stopKeepAlive();
  server.close(() => process.exit(1));
}
