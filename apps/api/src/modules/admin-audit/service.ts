import { pool } from "../../db/pool.js";
import type { PoolClient } from "pg";

type CreateAdminAuditLogInput = {
  actorUserId: number;
  actionType: string;
  targetEntity: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export const createAdminAuditLog = async (
  input: CreateAdminAuditLogInput,
  client?: PoolClient,
): Promise<void> => {
  const queryClient = client ?? pool;

  await queryClient.query(
    `INSERT INTO admin_audit_logs
      (actor_user_id, action_type, target_entity, target_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.actorUserId,
      input.actionType,
      input.targetEntity,
      input.targetId ?? null,
      JSON.stringify(input.details ?? {}),
    ],
  );
};

export const listAdminAuditLogs = async (limit = 200): Promise<
  Array<{
    id: number;
    actorUserId: number;
    actionType: string;
    targetEntity: string;
    targetId: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  }>
> => {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const result = await pool.query<{
    id: number;
    actor_user_id: number;
    action_type: string;
    target_entity: string;
    target_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT
        id,
        actor_user_id,
        action_type,
        target_entity,
        target_id,
        details,
        created_at
       FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT $1`,
    [safeLimit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actionType: row.action_type,
    targetEntity: row.target_entity,
    targetId: row.target_id,
    details: row.details ?? {},
    createdAt: row.created_at,
  }));
};
