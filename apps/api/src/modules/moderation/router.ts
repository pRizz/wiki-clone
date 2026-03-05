import { Router } from "express";
import { moderationActionSchema } from "@wiki/shared";
import { pool } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createKarmaEvent } from "../karma/service.js";
import type { AuthedRequest } from "../../types.js";

const moderationRouter = Router();

moderationRouter.get(
  "/actions",
  requireAuth,
  requireRole(["mod", "admin"]),
  async (_req, res) => {
    const result = await pool.query<{
      id: number;
      target_user_id: number;
      actor_user_id: number;
      action_type: string;
      reason_type: string;
      note: string;
      target_revision_id: number | null;
      created_at: string;
    }>(
      `SELECT
          id,
          target_user_id,
          actor_user_id,
          action_type,
          reason_type,
          note,
          target_revision_id,
          created_at
       FROM moderation_actions
       ORDER BY created_at DESC
       LIMIT 200`,
    );

    res.json({
      actions: result.rows.map((row) => ({
        id: row.id,
        targetUserId: row.target_user_id,
        actorUserId: row.actor_user_id,
        actionType: row.action_type,
        reasonType: row.reason_type,
        note: row.note,
        targetRevisionId: row.target_revision_id,
        createdAt: row.created_at,
      })),
    });
  },
);

moderationRouter.post(
  "/actions",
  requireAuth,
  requireRole(["mod", "admin"]),
  validateBody(moderationActionSchema),
  async (req: AuthedRequest, res) => {
    const input = moderationActionSchema.parse(req.body);
    const actorUser = req.user!;

    if (input.actionType === "ban" && actorUser.role !== "admin") {
      res.status(403).json({ error: "Only admins can ban users" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let targetRevisionId: number | null = null;
      if (input.actionType === "revert") {
        if (!input.articleSlug || !input.revisionId) {
          await client.query("ROLLBACK");
          res
            .status(400)
            .json({ error: "articleSlug and revisionId required for revert action" });
          return;
        }

        const articleResult = await client.query<{ id: number }>(
          "SELECT id FROM articles WHERE slug = $1",
          [input.articleSlug],
        );
        const maybeArticle = articleResult.rows[0];
        if (!maybeArticle) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Article not found" });
          return;
        }

        const sourceRevisionResult = await client.query<{
          id: number;
          editor_id: number;
          content: string;
        }>(
          `SELECT id, editor_id, content
             FROM article_revisions
            WHERE id = $1 AND article_id = $2`,
          [input.revisionId, maybeArticle.id],
        );
        const maybeSourceRevision = sourceRevisionResult.rows[0];
        if (!maybeSourceRevision) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Revision not found for article" });
          return;
        }

        const revisionResult = await client.query<{ id: number }>(
          `INSERT INTO article_revisions
            (article_id, editor_id, content, summary, is_revert, reverted_revision_id)
           VALUES ($1, $2, $3, $4, TRUE, $5)
           RETURNING id`,
          [
            maybeArticle.id,
            actorUser.id,
            maybeSourceRevision.content,
            `Moderation revert: ${input.note}`,
            input.revisionId,
          ],
        );
        targetRevisionId = revisionResult.rows[0]!.id;

        await client.query(
          `UPDATE articles
              SET current_content = $2,
                  current_revision_id = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [maybeArticle.id, maybeSourceRevision.content, targetRevisionId],
        );

        await createKarmaEvent(
          {
            userId: actorUser.id,
            actorUserId: actorUser.id,
            eventType: "valid_revert_performed",
            reason: `Moderation revert on ${input.articleSlug}`,
            metadata: {
              articleId: maybeArticle.id,
              sourceRevisionId: input.revisionId,
              revertRevisionId: targetRevisionId,
            },
          },
          client,
        );

        await createKarmaEvent(
          {
            userId: maybeSourceRevision.editor_id,
            actorUserId: actorUser.id,
            eventType: "edit_reverted",
            reason: `Moderation reverted your edit on ${input.articleSlug}`,
            metadata: {
              articleId: maybeArticle.id,
              sourceRevisionId: input.revisionId,
              revertRevisionId: targetRevisionId,
            },
          },
          client,
        );
      }

      if (input.actionType === "warn") {
        await createKarmaEvent(
          {
            userId: input.targetUserId,
            actorUserId: actorUser.id,
            eventType: "policy_warning",
            reason: input.note,
            metadata: { reasonType: input.reasonType },
          },
          client,
        );
      }

      if (input.actionType === "suspend") {
        const suspendHours = input.suspendHours ?? 24;
        await client.query(
          `UPDATE users
              SET status = 'suspended',
                  suspended_until = NOW() + ($2 || ' hours')::interval,
                  updated_at = NOW()
            WHERE id = $1`,
          [input.targetUserId, String(suspendHours)],
        );

        await createKarmaEvent(
          {
            userId: input.targetUserId,
            actorUserId: actorUser.id,
            eventType: "policy_suspension",
            reason: input.note,
            metadata: { reasonType: input.reasonType, suspendHours },
          },
          client,
        );
      }

      if (input.actionType === "ban") {
        await client.query(
          `UPDATE users
              SET status = 'banned',
                  suspended_until = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [input.targetUserId],
        );

        await createKarmaEvent(
          {
            userId: input.targetUserId,
            actorUserId: actorUser.id,
            eventType: "policy_ban",
            reason: input.note,
            metadata: { reasonType: input.reasonType },
          },
          client,
        );
      }

      const moderationResult = await client.query<{ id: number; created_at: string }>(
        `INSERT INTO moderation_actions
          (target_user_id, actor_user_id, action_type, reason_type, note, target_revision_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [
          input.targetUserId,
          actorUser.id,
          input.actionType,
          input.reasonType,
          input.note,
          targetRevisionId,
        ],
      );

      await client.query("COMMIT");

      res.status(201).json({
        action: {
          id: moderationResult.rows[0]!.id,
          createdAt: moderationResult.rows[0]!.created_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

export { moderationRouter };
