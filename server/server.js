// Starts the API server after the database connection is ready.
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { ensureDefaultAdmin } from "./services/defaultAdminService.js";
import { startServiceStatusMonitor } from "./services/serviceStatusService.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", { message: reason?.message || String(reason), stack: reason?.stack });
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", { message: error.message, stack: error.stack });
});

await connectDB();
await ensureDefaultAdmin();
startServiceStatusMonitor();

app.listen(env.port, () => {
  console.log(`Swavalambi Siddaganga Oil Mill API running on port ${env.port}`);
});
