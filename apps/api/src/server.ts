import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { createApp } from "./app.js";

const start = async (): Promise<void> => {
  await runMigrations();
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`API server listening on :${config.port}`);
  });
};

start().catch(async (error: unknown) => {
  console.error("Failed to start API server", error);
  await pool.end();
  process.exit(1);
});
