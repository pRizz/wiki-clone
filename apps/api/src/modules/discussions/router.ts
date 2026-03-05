import { Router } from "express";
import {
  createDiscussionCommentSchema,
  createDiscussionThreadSchema,
} from "@wiki/shared";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireActiveUser } from "../../middleware/active-user.js";
import { validateBody } from "../../middleware/validate.js";
import { createKarmaEvent } from "../karma/service.js";
import type { AuthedRequest } from "../../types.js";

const discussionsRouter = Router();

discussionsRouter.get("/articles/:slug/discussions", async (req, res) => {
  const { slug } = req.params;
  const result = await pool.query<{
    id: number;
    title: string;
    creator_id: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT dt.id, dt.title, dt.creator_id, dt.created_at, dt.updated_at
       FROM discussion_threads dt
       JOIN articles a ON a.id = dt.article_id
      WHERE a.slug = $1
      ORDER BY dt.updated_at DESC`,
    [slug],
  );

  res.json({
    threads: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      creatorId: row.creator_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

discussionsRouter.post(
  "/articles/:slug/discussions",
  requireAuth,
  requireActiveUser,
  validateBody(createDiscussionThreadSchema),
  async (req: AuthedRequest, res) => {
    const input = createDiscussionThreadSchema.parse(req.body);
    const { slug } = req.params;

    const articleResult = await pool.query<{ id: number }>(
      "SELECT id FROM articles WHERE slug = $1 LIMIT 1",
      [slug],
    );
    const maybeArticle = articleResult.rows[0];
    if (!maybeArticle) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    const result = await pool.query<{
      id: number;
      title: string;
      created_at: string;
    }>(
      `INSERT INTO discussion_threads (article_id, title, creator_id)
       VALUES ($1, $2, $3)
       RETURNING id, title, created_at`,
      [maybeArticle.id, input.title, req.user!.id],
    );

    const thread = result.rows[0]!;
    res.status(201).json({
      thread: {
        id: thread.id,
        title: thread.title,
        createdAt: thread.created_at,
      },
    });
  },
);

discussionsRouter.get("/discussions/:threadId/comments", async (req, res) => {
  const threadId = Number(req.params.threadId);
  if (Number.isNaN(threadId)) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }

  const result = await pool.query<{
    id: number;
    author_id: number;
    content: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, author_id, content, created_at, updated_at
       FROM discussion_comments
      WHERE thread_id = $1
      ORDER BY created_at ASC`,
    [threadId],
  );

  res.json({
    comments: result.rows.map((row) => ({
      id: row.id,
      authorId: row.author_id,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

discussionsRouter.post(
  "/discussions/:threadId/comments",
  requireAuth,
  requireActiveUser,
  validateBody(createDiscussionCommentSchema),
  async (req: AuthedRequest, res) => {
    const threadId = Number(req.params.threadId);
    if (Number.isNaN(threadId)) {
      res.status(400).json({ error: "Invalid thread id" });
      return;
    }

    const input = createDiscussionCommentSchema.parse(req.body);
    const threadResult = await pool.query<{ id: number }>(
      "SELECT id FROM discussion_threads WHERE id = $1 LIMIT 1",
      [threadId],
    );

    const maybeThread = threadResult.rows[0];
    if (!maybeThread) {
      res.status(404).json({ error: "Discussion thread not found" });
      return;
    }

    const result = await pool.query<{
      id: number;
      created_at: string;
    }>(
      `INSERT INTO discussion_comments (thread_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [threadId, req.user!.id, input.content],
    );

    await createKarmaEvent({
      userId: req.user!.id,
      actorUserId: req.user!.id,
      eventType: "discussion_comment_created",
      reason: `Posted discussion comment in thread ${threadId}`,
      metadata: { threadId, commentId: result.rows[0]!.id },
    });

    await pool.query(
      "UPDATE discussion_threads SET updated_at = NOW() WHERE id = $1",
      [threadId],
    );

    res.status(201).json({
      comment: {
        id: result.rows[0]!.id,
        createdAt: result.rows[0]!.created_at,
      },
    });
  },
);

export { discussionsRouter };
