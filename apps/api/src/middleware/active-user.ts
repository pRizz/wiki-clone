import type { NextFunction, Response } from "express";
import { pool } from "../db/pool.js";
import type { AuthedRequest } from "../types.js";

export const requireActiveUser = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const maybeUser = req.user;
  if (!maybeUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const result = await pool.query<{
    status: string;
    suspended_until: Date | null;
  }>("SELECT status, suspended_until FROM users WHERE id = $1", [maybeUser.id]);

  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (user.status === "banned") {
    res.status(403).json({ error: "User is banned" });
    return;
  }

  if (user.status === "suspended") {
    const suspendedUntil = user.suspended_until;
    if (suspendedUntil && suspendedUntil.getTime() > Date.now()) {
      res.status(403).json({ error: "User is suspended" });
      return;
    }

    await pool.query(
      `UPDATE users
          SET status = 'active', suspended_until = NULL, updated_at = NOW()
        WHERE id = $1`,
      [maybeUser.id],
    );
  }

  next();
};
