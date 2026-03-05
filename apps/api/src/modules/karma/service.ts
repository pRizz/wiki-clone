import type { PoolClient } from "pg";
import {
  defaultKarmaConfig,
  karmaConfigSchema,
  type KarmaConfig,
  type KarmaEventType,
} from "@wiki/shared";
import { pool } from "../../db/pool.js";

const lowFrictionEventTypes: KarmaEventType[] = [
  "discussion_comment_created",
  "discussion_comment_upvoted",
  "revision_upvoted",
];

type KarmaEventInput = {
  userId: number;
  actorUserId?: number | null;
  eventType: KarmaEventType;
  reason: string;
  metadata?: Record<string, unknown>;
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

export const buildEventFingerprint = (input: KarmaEventInput): string => {
  return `${input.userId}|${input.actorUserId ?? 0}|${input.eventType}|${input.reason.trim()}|${stableSerialize(
    input.metadata ?? {},
  )}`;
};

export const getKarmaConfig = async (
  client?: PoolClient,
): Promise<KarmaConfig> => {
  const queryClient = client ?? pool;
  const result = await queryClient.query<{ config: unknown }>(
    "SELECT config FROM karma_config WHERE id = 1",
  );
  const maybeConfig = result.rows[0]?.config;

  if (!maybeConfig) {
    return defaultKarmaConfig;
  }

  const parsed = karmaConfigSchema.safeParse(maybeConfig);
  return parsed.success ? parsed.data : defaultKarmaConfig;
};

export const updateKarmaConfig = async (config: KarmaConfig): Promise<void> => {
  await pool.query(
    `INSERT INTO karma_config (id, config, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id)
     DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
    [JSON.stringify(config)],
  );
};

const reachedDailyCap = async (
  client: PoolClient,
  userId: number,
  cap: number,
): Promise<boolean> => {
  if (cap <= 0) {
    return false;
  }

  const result = await client.query<{ points: number }>(
    `SELECT COALESCE(SUM(points), 0)::int AS points
      FROM karma_events
     WHERE user_id = $1
       AND points > 0
       AND event_type = ANY($2::text[])
       AND created_at >= DATE_TRUNC('day', NOW())`,
    [userId, lowFrictionEventTypes],
  );

  return (result.rows[0]?.points ?? 0) >= cap;
};

const hasDuplicateFingerprintWithinWindow = async (
  client: PoolClient,
  eventFingerprint: string,
  windowMinutes: number,
): Promise<boolean> => {
  if (windowMinutes <= 0) {
    return false;
  }

  const result = await client.query<{ id: number }>(
    `SELECT id
       FROM karma_events
      WHERE event_fingerprint = $1
        AND created_at >= NOW() - ($2 || ' minutes')::interval
      LIMIT 1`,
    [eventFingerprint, String(windowMinutes)],
  );

  return Boolean(result.rows[0]);
};

export const createKarmaEvent = async (
  input: KarmaEventInput,
  client?: PoolClient,
): Promise<void> => {
  const queryClient = client ?? (await pool.connect());
  const needsRelease = !client;

  try {
    const karmaConfig = await getKarmaConfig(queryClient);
    const points = karmaConfig.weights[input.eventType];
    const eventFingerprint = buildEventFingerprint(input);

    if (points > 0 && lowFrictionEventTypes.includes(input.eventType)) {
      const isCapped = await reachedDailyCap(
        queryClient,
        input.userId,
        karmaConfig.antiAbuse.dailyLowFrictionPositiveCap,
      );
      if (isCapped) {
        return;
      }
    }

    const isDuplicate = await hasDuplicateFingerprintWithinWindow(
      queryClient,
      eventFingerprint,
      karmaConfig.antiAbuse.duplicateWindowMinutes,
    );
    if (isDuplicate) {
      return;
    }

    await queryClient.query(
      `INSERT INTO karma_events
        (user_id, actor_user_id, event_type, points, reason, event_fingerprint, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.userId,
        input.actorUserId ?? null,
        input.eventType,
        points,
        input.reason,
        eventFingerprint,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } finally {
    if (needsRelease) {
      queryClient.release();
    }
  }
};

export const getUserKarmaLedger = async (
  userId: number,
): Promise<
  Array<{
    id: number;
    eventType: string;
    points: number;
    reason: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>
> => {
  const result = await pool.query<{
    id: number;
    event_type: string;
    points: number;
    reason: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id, event_type, points, reason, metadata, created_at
       FROM karma_events
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    points: row.points,
    reason: row.reason,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
};

export const calculateKarmaTotals = async (
  userId: number,
): Promise<{
  positive: number;
  negative: number;
  decayedPositive: number;
  total: number;
}> => {
  const [eventsResult, userResult] = await Promise.all([
    pool.query<{ positive: number; negative: number }>(
      `SELECT
          COALESCE(SUM(CASE WHEN points > 0 THEN points END), 0)::int AS positive,
          COALESCE(SUM(CASE WHEN points < 0 THEN points END), 0)::int AS negative
       FROM karma_events
       WHERE user_id = $1`,
      [userId],
    ),
    pool.query<{ created_at: Date }>(
      "SELECT created_at FROM users WHERE id = $1 LIMIT 1",
      [userId],
    ),
  ]);

  const positive = eventsResult.rows[0]?.positive ?? 0;
  const negative = eventsResult.rows[0]?.negative ?? 0;
  const userCreatedAt = userResult.rows[0]?.created_at;
  const karmaConfig = await getKarmaConfig();

  const decayedPositive = applyKarmaDecay({
    positive,
    userCreatedAt,
    decay: karmaConfig.decay,
    now: new Date(),
  });

  const total = Math.max(karmaConfig.decay.floor, decayedPositive + negative);

  return {
    positive,
    negative,
    decayedPositive,
    total,
  };
};

type ApplyKarmaDecayInput = {
  positive: number;
  userCreatedAt?: Date;
  now: Date;
  decay: KarmaConfig["decay"];
};

export const applyKarmaDecay = ({
  positive,
  userCreatedAt,
  now,
  decay,
}: ApplyKarmaDecayInput): number => {
  if (!decay.enabled || !userCreatedAt) {
    return positive;
  }

  const ageMs = now.getTime() - userCreatedAt.getTime();
  const graceMs = decay.graceDays * 24 * 60 * 60 * 1000;
  if (ageMs <= graceMs) {
    return positive;
  }

  const decayMs = ageMs - graceMs;
  const weeks = Math.floor(decayMs / (7 * 24 * 60 * 60 * 1000));
  const multiplier = Math.pow(1 - decay.weeklyRatePct / 100, weeks);
  return Math.round(positive * multiplier);
};
