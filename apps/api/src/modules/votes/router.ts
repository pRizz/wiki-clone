import { Router } from "express";
import { castVoteSchema } from "@wiki/shared";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireActiveUser } from "../../middleware/active-user.js";
import { validateBody } from "../../middleware/validate.js";
import { createKarmaEvent } from "../karma/service.js";
import type { AuthedRequest } from "../../types.js";

const votesRouter = Router();

votesRouter.post(
  "/",
  requireAuth,
  requireActiveUser,
  validateBody(castVoteSchema),
  async (req: AuthedRequest, res) => {
    const input = castVoteSchema.parse(req.body);

    const existingVote = await pool.query<{ id: number }>(
      `SELECT id
         FROM votes
        WHERE target_type = $1 AND target_id = $2 AND voter_id = $3
        LIMIT 1`,
      [input.targetType, input.targetId, req.user!.id],
    );

    if (existingVote.rows[0]) {
      res.status(409).json({ error: "Vote already exists and cannot be changed" });
      return;
    }

    const targetOwnerQuery =
      input.targetType === "revision"
        ? `SELECT editor_id AS owner_id FROM article_revisions WHERE id = $1`
        : `SELECT author_id AS owner_id FROM discussion_comments WHERE id = $1`;

    const targetOwnerResult = await pool.query<{ owner_id: number }>(
      targetOwnerQuery,
      [input.targetId],
    );
    const maybeTargetOwner = targetOwnerResult.rows[0];

    if (!maybeTargetOwner) {
      res.status(404).json({ error: "Vote target not found" });
      return;
    }

    if (maybeTargetOwner.owner_id === req.user!.id) {
      res.status(400).json({ error: "Cannot vote on your own content" });
      return;
    }

    await pool.query(
      `INSERT INTO votes (target_type, target_id, voter_id, value)
       VALUES ($1, $2, $3, $4)`,
      [input.targetType, input.targetId, req.user!.id, input.value],
    );

    const eventType =
      input.targetType === "revision"
        ? input.value === 1
          ? "revision_upvoted"
          : "revision_downvoted"
        : input.value === 1
          ? "discussion_comment_upvoted"
          : "discussion_comment_downvoted";

    await createKarmaEvent({
      userId: maybeTargetOwner.owner_id,
      actorUserId: req.user!.id,
      eventType,
      reason: `${input.targetType} received a ${input.value === 1 ? "upvote" : "downvote"}`,
      metadata: {
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });

    res.status(201).json({
      vote: {
        targetType: input.targetType,
        targetId: input.targetId,
        value: input.value,
      },
    });
  },
);

export { votesRouter };
