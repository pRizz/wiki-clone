import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { listAdminAuditLogs } from "./service.js";

const adminAuditRouter = Router();

adminAuditRouter.get(
  "/logs",
  requireAuth,
  requireRole(["admin"]),
  async (req, res) => {
    const maybeLimit = req.query.limit;
    const limit = maybeLimit === undefined ? undefined : Number(maybeLimit);
    if (limit !== undefined && Number.isNaN(limit)) {
      res.status(400).json({ error: "Invalid limit query param" });
      return;
    }

    const logs = await listAdminAuditLogs(limit);
    res.json({ logs });
  },
);

export { adminAuditRouter };
