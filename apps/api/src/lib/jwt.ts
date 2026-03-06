import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { SessionUser } from "../types.js";

const expiresIn = "7d";

export const signUserToken = (user: SessionUser): string =>
  jwt.sign(user, config.jwtSecret, { expiresIn });

export const verifyUserToken = (token: string): SessionUser | null => {
  try {
    return jwt.verify(token, config.jwtSecret) as SessionUser;
  } catch (_error) {
    return null;
  }
};
