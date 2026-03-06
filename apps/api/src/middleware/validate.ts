import type { NextFunction, Response } from "express";
import type { ZodType } from "zod";
import type { AuthedRequest } from "../types.js";

export const validateBody =
  <T>(schema: ZodType<T>) =>
  (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    req.body = parsed.data;
    next();
  };
