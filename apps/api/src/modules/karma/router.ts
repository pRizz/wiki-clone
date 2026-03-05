import { Router } from "express";
import { karmaConfigSchema } from "@wiki/shared";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
  calculateKarmaTotals,
  getKarmaConfig,
  getUserKarmaLedger,
  listAbuseSignals,
  updateKarmaConfig,
} from "./service.js";

const karmaRouter = Router();

karmaRouter.get("/config", async (_req, res) => {
  const config = await getKarmaConfig();
  res.json({ config });
});

karmaRouter.put(
  "/config",
  requireAuth,
  requireRole(["admin"]),
  validateBody(karmaConfigSchema),
  async (req, res) => {
    const config = karmaConfigSchema.parse(req.body);
    await updateKarmaConfig(config);
    res.status(204).send();
  },
);

karmaRouter.get("/users/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (Number.isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [ledger, totals] = await Promise.all([
    getUserKarmaLedger(userId),
    calculateKarmaTotals(userId),
  ]);

  res.json({
    totals,
    ledger,
  });
});

karmaRouter.get(
  "/signals",
  requireAuth,
  requireRole(["mod", "admin"]),
  async (req, res) => {
    const maybeUserIdQuery = req.query.userId;
    const maybeLimitQuery = req.query.limit;

    const userId =
      maybeUserIdQuery === undefined ? undefined : Number(maybeUserIdQuery);
    if (userId !== undefined && Number.isNaN(userId)) {
      res.status(400).json({ error: "Invalid userId query param" });
      return;
    }

    const limit =
      maybeLimitQuery === undefined ? undefined : Number(maybeLimitQuery);
    if (limit !== undefined && Number.isNaN(limit)) {
      res.status(400).json({ error: "Invalid limit query param" });
      return;
    }

    const signals = await listAbuseSignals({
      userId,
      limit,
    });
    res.json({ signals });
  },
);

export { karmaRouter };
