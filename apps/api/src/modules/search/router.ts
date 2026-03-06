import { Router } from "express";
import { pool } from "../../db/pool.js";

const searchRouter = Router();

searchRouter.get("/", async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (!query) {
    res.json({ results: [] });
    return;
  }

  const result = await pool.query<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    updated_at: string;
  }>(
    `SELECT
        id,
        slug,
        title,
        LEFT(current_content, 280) AS excerpt,
        updated_at
       FROM articles
      WHERE title ILIKE $1 OR slug ILIKE $1 OR current_content ILIKE $1
      ORDER BY updated_at DESC
      LIMIT 30`,
    [`%${query}%`],
  );

  res.json({
    results: result.rows,
  });
});

export { searchRouter };
