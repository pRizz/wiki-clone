import type { NextFunction, Response } from "express";
import type { Role } from "@wiki/shared";
import { verifyUserToken } from "../lib/jwt.js";
import type { AuthedRequest } from "../types.js";

const getBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length);
};

export const attachAuthUser = (
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void => {
  const maybeToken = getBearerToken(req.header("authorization"));
  if (!maybeToken) {
    next();
    return;
  }

  const maybeUser = verifyUserToken(maybeToken);
  if (maybeUser) {
    req.user = maybeUser;
  }

  next();
};

export const requireAuth = (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
};

export const requireRole = (allowedRoles: Role[]) => {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }

    next();
  };
};
