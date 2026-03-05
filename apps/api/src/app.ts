import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { attachAuthUser } from "./middleware/auth.js";
import { articlesRouter } from "./modules/articles/router.js";
import { authRouter } from "./modules/auth/router.js";
import { discussionsRouter } from "./modules/discussions/router.js";
import { karmaRouter } from "./modules/karma/router.js";
import { moderationRouter } from "./modules/moderation/router.js";
import { searchRouter } from "./modules/search/router.js";
import { usersRouter } from "./modules/users/router.js";
import { votesRouter } from "./modules/votes/router.js";

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: config.appOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(attachAuthUser);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/articles", articlesRouter);
  app.use("/api", discussionsRouter);
  app.use("/api/votes", votesRouter);
  app.use("/api/karma", karmaRouter);
  app.use("/api/moderation", moderationRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/users", usersRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response) => {
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Unknown server error" });
  });

  return app;
};
