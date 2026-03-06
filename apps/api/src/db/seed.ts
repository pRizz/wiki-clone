import { runMigrations } from "./migrate.js";
import { pool } from "./pool.js";

const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";

const seed = async (): Promise<void> => {
  await runMigrations();
  await pool.query(
    `INSERT INTO users (email, role, status)
     VALUES ($1, 'admin', 'active')
     ON CONFLICT (email)
     DO UPDATE SET role = 'admin', status = 'active', updated_at = NOW()`,
    [adminEmail.toLowerCase()],
  );
};

seed()
  .then(async () => {
    console.log(`Admin user ensured for ${adminEmail}`);
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Failed to seed admin user", error);
    await pool.end();
    process.exit(1);
  });
