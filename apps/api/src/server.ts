import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { createApp } from "./app.js";
import { initObservability } from "./lib/observability.js";
import { logError, logInfo } from "./lib/logger.js";

const start = async (): Promise<void> => {
  initObservability();
  await runMigrations();
  const app = createApp();

  app.listen(config.port, () => {
    logInfo("api_server_started", { port: config.port });
  });
};

start().catch(async (error: unknown) => {
  logError("api_server_start_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  await pool.end();
  process.exit(1);
});
