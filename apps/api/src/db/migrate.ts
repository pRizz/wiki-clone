import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultKarmaConfig } from "@wiki/shared";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const runMigrations = async (): Promise<void> => {
  const migrationPath = resolve(__dirname, "migrations", "001_init.sql");
  const sql = await readFile(migrationPath, "utf-8");

  await pool.query(sql);
  await pool.query(
    `INSERT INTO karma_config (id, config)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(defaultKarmaConfig)],
  );
};
