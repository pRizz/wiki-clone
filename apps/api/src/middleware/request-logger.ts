import type { NextFunction, Request, Response } from "express";
import { logInfo } from "../lib/logger.js";

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logInfo("http_request", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
};
