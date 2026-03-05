import { Router } from "express";
import { updateUserSchema } from "@wiki/shared";
import { pool } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createAdminAuditLog } from "../admin-audit/service.js";
import type { AuthedRequest } from "../../types.js";

const usersRouter = Router();

usersRouter.get("/", requireAuth, requireRole(["mod", "admin"]), async (_req, res) => {
  const result = await pool.query<{
    id: number;
    email: string;
    role: string;
    status: string;
    suspended_until: string | null;
    created_at: string;
  }>(
    `SELECT id, email, role, status, suspended_until, created_at
       FROM users
      ORDER BY created_at DESC`,
  );

  res.json({
    users: result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      suspendedUntil: row.suspended_until,
      createdAt: row.created_at,
    })),
  });
});

usersRouter.patch(
  "/:userId",
  requireAuth,
  requireRole(["admin"]),
  validateBody(updateUserSchema),
  async (req: AuthedRequest, res) => {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const updates = updateUserSchema.parse(req.body);
    if (!updates.role && !updates.status) {
      res.status(400).json({ error: "No updates provided" });
      return;
    }

    const result = await pool.query<{
      id: number;
      email: string;
      role: string;
      status: string;
      suspended_until: string | null;
    }>(
      `UPDATE users
          SET role = COALESCE($2, role),
              status = COALESCE($3, status),
              updated_at = NOW()
        WHERE id = $1
      RETURNING id, email, role, status, suspended_until`,
      [userId, updates.role ?? null, updates.status ?? null],
    );

    const maybeUser = result.rows[0];
    if (!maybeUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await createAdminAuditLog({
      actorUserId: req.user!.id,
      actionType: "user_updated",
      targetEntity: "user",
      targetId: String(maybeUser.id),
      details: {
        role: maybeUser.role,
        status: maybeUser.status,
      },
    });

    res.json({
      user: {
        id: maybeUser.id,
        email: maybeUser.email,
        role: maybeUser.role,
        status: maybeUser.status,
        suspendedUntil: maybeUser.suspended_until,
      },
    });
  },
);

export { usersRouter };
