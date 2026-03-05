import pg from "pg";
import { config } from "../config.js";

const { Pool, types } = pg;

types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  connectionString: config.databaseUrl,
});
