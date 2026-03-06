import { createHash, randomBytes } from "node:crypto";

export const createOpaqueToken = (): string => randomBytes(24).toString("hex");

export const hashToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
