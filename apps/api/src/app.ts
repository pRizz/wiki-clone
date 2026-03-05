import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { attachAuthUser } from "./middleware/auth.js";
import { requestLogger } from "./middleware/request-logger.js";
import { articlesRouter } from "./modules/articles/router.js";
import { authRouter } from "./modules/auth/router.js";
import { discussionsRouter } from "./modules/discussions/router.js";
import { karmaRouter } from "./modules/karma/router.js";
import { moderationRouter } from "./modules/moderation/router.js";
import { searchRouter } from "./modules/search/router.js";
import { usersRouter } from "./modules/users/router.js";
import { votesRouter } from "./modules/votes/router.js";
import { captureException } from "./lib/observability.js";
import { logError } from "./lib/logger.js";

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: config.appOrigin,
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: "2mb" }));
  app.use(requestLogger);
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

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof Error) {
        captureException(error);
        logError("unhandled_error", {
          message: error.message,
          stack: error.stack ?? "",
        });
        res.status(500).json({ error: error.message });
        return;
      }

      captureException(error);
      logError("unknown_unhandled_error");
      res.status(500).json({ error: "Unknown server error" });
    },
  );

  return app;
};
