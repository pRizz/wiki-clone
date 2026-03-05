import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createPasskeySchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  passkeyLoginSchema,
  roleSchema,
  userStatusSchema,
} from "@wiki/shared";
import { pool } from "../../db/pool.js";
import { createOpaqueToken, hashToken } from "../../lib/crypto.js";
import { signUserToken } from "../../lib/jwt.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import type { AuthedRequest } from "../../types.js";

const magicLinkTtlMinutes = 20;

const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const makeSessionUser = (row: {
  id: number;
  email: string;
  role: string;
  status: string;
}) => ({
  id: row.id,
  email: row.email,
  role: roleSchema.parse(row.role),
  status: userStatusSchema.parse(row.status),
});

const upsertUserByEmail = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query<{
    id: number;
    email: string;
    role: string;
    status: string;
  }>(
    `INSERT INTO users (email, role, status)
     VALUES ($1, 'user', 'active')
     ON CONFLICT (email)
     DO UPDATE SET updated_at = NOW()
     RETURNING id, email, role, status`,
    [normalizedEmail],
  );

  return makeSessionUser(result.rows[0]!);
};

authRouter.post(
  "/magic-link/request",
  authLimiter,
  validateBody(magicLinkRequestSchema),
  async (req, res) => {
    const { email } = magicLinkRequestSchema.parse(req.body);
    const user = await upsertUserByEmail(email);

    const token = createOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + magicLinkTtlMinutes * 60 * 1000);

    await pool.query(
      `INSERT INTO magic_links (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );

    const baseResponse: Record<string, unknown> = {
      message: "Magic link issued",
      expiresAt: expiresAt.toISOString(),
    };

    if (process.env.NODE_ENV !== "production") {
      baseResponse.token = token;
    }

    res.status(201).json(baseResponse);
  },
);

authRouter.post(
  "/magic-link/verify",
  authLimiter,
  validateBody(magicLinkVerifySchema),
  async (req, res) => {
    const { token } = magicLinkVerifySchema.parse(req.body);
    const tokenHash = hashToken(token);

    const result = await pool.query<{
      id: number;
      user_id: number;
      expires_at: Date;
      used_at: Date | null;
      email: string;
      role: string;
      status: string;
    }>(
      `SELECT
          ml.id,
          ml.user_id,
          ml.expires_at,
          ml.used_at,
          u.email,
          u.role,
          u.status
       FROM magic_links ml
       JOIN users u ON u.id = ml.user_id
      WHERE ml.token_hash = $1
      ORDER BY ml.created_at DESC
      LIMIT 1`,
      [tokenHash],
    );

    const maybeMagicLink = result.rows[0];
    if (!maybeMagicLink) {
      res.status(400).json({ error: "Invalid magic link token" });
      return;
    }

    if (maybeMagicLink.used_at) {
      res.status(400).json({ error: "Magic link already used" });
      return;
    }

    if (maybeMagicLink.expires_at.getTime() < Date.now()) {
      res.status(400).json({ error: "Magic link expired" });
      return;
    }

    await pool.query("UPDATE magic_links SET used_at = NOW() WHERE id = $1", [
      maybeMagicLink.id,
    ]);

    const sessionUser = makeSessionUser({
      id: maybeMagicLink.user_id,
      email: maybeMagicLink.email,
      role: maybeMagicLink.role,
      status: maybeMagicLink.status,
    });

    const tokenJwt = signUserToken(sessionUser);
    res.json({
      token: tokenJwt,
      user: sessionUser,
    });
  },
);

authRouter.post(
  "/passkeys/login",
  authLimiter,
  validateBody(passkeyLoginSchema),
  async (req, res) => {
    const { credentialId } = passkeyLoginSchema.parse(req.body);
    const result = await pool.query<{
      user_id: number;
      email: string;
      role: string;
      status: string;
    }>(
      `SELECT p.user_id, u.email, u.role, u.status
         FROM passkeys p
         JOIN users u ON u.id = p.user_id
        WHERE p.credential_id = $1`,
      [credentialId],
    );

    const maybeUser = result.rows[0];
    if (!maybeUser) {
      res.status(404).json({ error: "Passkey not found" });
      return;
    }

    await pool.query(
      "UPDATE passkeys SET last_used_at = NOW() WHERE credential_id = $1",
      [credentialId],
    );

    const sessionUser = makeSessionUser({
      id: maybeUser.user_id,
      email: maybeUser.email,
      role: maybeUser.role,
      status: maybeUser.status,
    });

    const tokenJwt = signUserToken(sessionUser);
    res.json({
      token: tokenJwt,
      user: sessionUser,
    });
  },
);

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.get("/passkeys", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query<{
    id: number;
    name: string;
    credential_id: string;
    created_at: string;
    last_used_at: string | null;
  }>(
    `SELECT id, name, credential_id, created_at, last_used_at
       FROM passkeys
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [req.user!.id],
  );

  res.json({
    passkeys: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      credentialId: row.credential_id,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    })),
  });
});

authRouter.post(
  "/passkeys",
  requireAuth,
  validateBody(createPasskeySchema),
  async (req: AuthedRequest, res) => {
    const { name, credentialId, publicKey } = createPasskeySchema.parse(req.body);
    const result = await pool.query<{
      id: number;
      name: string;
      credential_id: string;
      created_at: string;
    }>(
      `INSERT INTO passkeys (user_id, name, credential_id, public_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, credential_id, created_at`,
      [req.user!.id, name, credentialId, publicKey],
    );

    const passkey = result.rows[0]!;
    res.status(201).json({
      passkey: {
        id: passkey.id,
        name: passkey.name,
        credentialId: passkey.credential_id,
        createdAt: passkey.created_at,
      },
    });
  },
);

authRouter.delete(
  "/passkeys/:passkeyId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const passkeyId = Number(req.params.passkeyId);
    if (Number.isNaN(passkeyId)) {
      res.status(400).json({ error: "Invalid passkey id" });
      return;
    }

    const result = await pool.query<{ id: number }>(
      `DELETE FROM passkeys
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [passkeyId, req.user!.id],
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Passkey not found" });
      return;
    }

    res.status(204).send();
  },
);

export { authRouter };
