import { Router } from "express";
import {
  createArticleSchema,
  editArticleSchema,
  revertArticleSchema,
} from "@wiki/shared";
import { pool } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireActiveUser } from "../../middleware/active-user.js";
import { validateBody } from "../../middleware/validate.js";
import { createKarmaEvent } from "../karma/service.js";
import type { AuthedRequest } from "../../types.js";
import { buildLineDiff } from "./diff.js";
import { runSpan } from "../../lib/observability.js";

const articlesRouter = Router();

const articleSelect = `SELECT
    a.id,
    a.slug,
    a.title,
    a.current_content,
    a.current_revision_id,
    a.author_id,
    a.created_at,
    a.updated_at
  FROM articles a`;

articlesRouter.get("/", async (req, res) => {
  const maybeQuery = String(req.query.query ?? "").trim();
  if (!maybeQuery) {
    const result = await pool.query<{
      slug: string;
      title: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT slug, title, created_at, updated_at
         FROM articles
        ORDER BY updated_at DESC
        LIMIT 50`,
    );
    res.json({ articles: result.rows });
    return;
  }

  const result = await pool.query<{
    slug: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT slug, title, created_at, updated_at
       FROM articles
      WHERE title ILIKE $1 OR slug ILIKE $1 OR current_content ILIKE $1
      ORDER BY updated_at DESC
      LIMIT 50`,
    [`%${maybeQuery}%`],
  );

  res.json({ articles: result.rows });
});

articlesRouter.get("/:slug", async (req, res) => {
  const { slug } = req.params;
  const result = await pool.query<{
    id: number;
    slug: string;
    title: string;
    current_content: string;
    current_revision_id: number;
    author_id: number;
    created_at: string;
    updated_at: string;
  }>(`${articleSelect} WHERE slug = $1 LIMIT 1`, [slug]);

  const maybeArticle = result.rows[0];
  if (!maybeArticle) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  res.json({
    article: {
      id: maybeArticle.id,
      slug: maybeArticle.slug,
      title: maybeArticle.title,
      content: maybeArticle.current_content,
      currentRevisionId: maybeArticle.current_revision_id,
      authorId: maybeArticle.author_id,
      createdAt: maybeArticle.created_at,
      updatedAt: maybeArticle.updated_at,
    },
  });
});

articlesRouter.post(
  "/",
  requireAuth,
  requireActiveUser,
  validateBody(createArticleSchema),
  async (req: AuthedRequest, res) => {
    await runSpan("article.create", "Create article", async () => {
      const input = createArticleSchema.parse(req.body);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const articleResult = await client.query<{
          id: number;
          slug: string;
          title: string;
          created_at: string;
        }>(
          `INSERT INTO articles (slug, title, current_content, author_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, slug, title, created_at`,
          [input.slug, input.title, input.content, req.user!.id],
        );

        const article = articleResult.rows[0]!;
        const revisionResult = await client.query<{ id: number }>(
          `INSERT INTO article_revisions (article_id, editor_id, content, summary)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [article.id, req.user!.id, input.content, input.summary ?? null],
        );

        const revisionId = revisionResult.rows[0]!.id;
        await client.query(
          "UPDATE articles SET current_revision_id = $2 WHERE id = $1",
          [article.id, revisionId],
        );

        await createKarmaEvent(
          {
            userId: req.user!.id,
            actorUserId: req.user!.id,
            eventType: "article_created",
            reason: `Created article ${input.slug}`,
            metadata: { articleId: article.id, revisionId },
          },
          client,
        );

        await client.query("COMMIT");

        res.status(201).json({
          article: {
            id: article.id,
            slug: article.slug,
            title: article.title,
            currentRevisionId: revisionId,
            createdAt: article.created_at,
          },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof Error && /duplicate key/.test(error.message)) {
          res.status(409).json({ error: "Article slug already exists" });
          return;
        }

        throw error;
      } finally {
        client.release();
      }
    });
  },
);

articlesRouter.put(
  "/:slug",
  requireAuth,
  requireActiveUser,
  validateBody(editArticleSchema),
  async (req: AuthedRequest, res) => {
    await runSpan("article.edit", "Edit article", async () => {
      const { slug } = req.params;
      const input = editArticleSchema.parse(req.body);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const articleResult = await client.query<{ id: number; title: string }>(
          "SELECT id, title FROM articles WHERE slug = $1 LIMIT 1",
          [slug],
        );
        const maybeArticle = articleResult.rows[0];
        if (!maybeArticle) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Article not found" });
          return;
        }

        const revisionResult = await client.query<{ id: number; created_at: string }>(
          `INSERT INTO article_revisions (article_id, editor_id, content, summary)
           VALUES ($1, $2, $3, $4)
           RETURNING id, created_at`,
          [maybeArticle.id, req.user!.id, input.content, input.summary ?? null],
        );

        const revisionId = revisionResult.rows[0]!.id;
        await client.query(
          `UPDATE articles
              SET current_content = $2,
                  current_revision_id = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [maybeArticle.id, input.content, revisionId],
        );

        await createKarmaEvent(
          {
            userId: req.user!.id,
            actorUserId: req.user!.id,
            eventType: "article_edited",
            reason: `Edited article ${slug}`,
            metadata: { articleId: maybeArticle.id, revisionId },
          },
          client,
        );

        await client.query("COMMIT");

        res.json({
          revision: {
            id: revisionId,
            createdAt: revisionResult.rows[0]!.created_at,
          },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  },
);

articlesRouter.get("/:slug/history", async (req, res) => {
  const { slug } = req.params;
  const result = await pool.query<{
    id: number;
    editor_id: number;
    summary: string | null;
    content: string;
    is_revert: boolean;
    reverted_revision_id: number | null;
    created_at: string;
  }>(
    `SELECT
        r.id,
        r.editor_id,
        r.summary,
        r.content,
        r.is_revert,
        r.reverted_revision_id,
        r.created_at
       FROM article_revisions r
       JOIN articles a ON a.id = r.article_id
      WHERE a.slug = $1
      ORDER BY r.created_at DESC`,
    [slug],
  );

  res.json({
    revisions: result.rows.map((row) => ({
      id: row.id,
      editorId: row.editor_id,
      summary: row.summary,
      content: row.content,
      isRevert: row.is_revert,
      revertedRevisionId: row.reverted_revision_id,
      createdAt: row.created_at,
    })),
  });
});

const parseRevisionIdQuery = (value: unknown): number | null => {
  const maybeNumber = Number(value);
  if (Number.isNaN(maybeNumber) || maybeNumber <= 0) {
    return null;
  }

  return maybeNumber;
};

articlesRouter.get("/:slug/diff", async (req, res) => {
  const { slug } = req.params;
  const fromRevisionId = parseRevisionIdQuery(req.query.fromRevisionId);
  const toRevisionId = parseRevisionIdQuery(req.query.toRevisionId);

  const articleResult = await pool.query<{ id: number }>(
    "SELECT id FROM articles WHERE slug = $1 LIMIT 1",
    [slug],
  );
  const maybeArticle = articleResult.rows[0];
  if (!maybeArticle) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  if (fromRevisionId && toRevisionId) {
    const revisionsResult = await pool.query<{ id: number; content: string }>(
      `SELECT id, content
         FROM article_revisions
        WHERE article_id = $1 AND id = ANY($2::int[])`,
      [maybeArticle.id, [fromRevisionId, toRevisionId]],
    );

    const fromRevision = revisionsResult.rows.find((row) => row.id === fromRevisionId);
    const toRevision = revisionsResult.rows.find((row) => row.id === toRevisionId);

    if (!fromRevision || !toRevision) {
      res.status(404).json({ error: "Revision pair not found for article" });
      return;
    }

    res.json({
      fromRevisionId,
      toRevisionId,
      lines: buildLineDiff(fromRevision.content, toRevision.content),
    });
    return;
  }

  const latestRevisionsResult = await pool.query<{ id: number; content: string }>(
    `SELECT id, content
       FROM article_revisions
      WHERE article_id = $1
      ORDER BY created_at DESC
      LIMIT 2`,
    [maybeArticle.id],
  );

  if (latestRevisionsResult.rows.length < 2) {
    res.status(400).json({ error: "Need at least two revisions to compute diff" });
    return;
  }

  const newest = latestRevisionsResult.rows[0]!;
  const previous = latestRevisionsResult.rows[1]!;

  res.json({
    fromRevisionId: previous.id,
    toRevisionId: newest.id,
    lines: buildLineDiff(previous.content, newest.content),
  });
});

articlesRouter.post(
  "/:slug/revert",
  requireAuth,
  requireRole(["mod", "admin"]),
  validateBody(revertArticleSchema),
  async (req: AuthedRequest, res) => {
    const { slug } = req.params;
    const input = revertArticleSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const articleResult = await client.query<{
        id: number;
        current_revision_id: number;
      }>("SELECT id, current_revision_id FROM articles WHERE slug = $1", [slug]);
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

      const newRevisionResult = await client.query<{ id: number }>(
        `INSERT INTO article_revisions
          (article_id, editor_id, content, summary, is_revert, reverted_revision_id)
         VALUES ($1, $2, $3, $4, TRUE, $5)
         RETURNING id`,
        [
          maybeArticle.id,
          req.user!.id,
          maybeSourceRevision.content,
          `Revert: ${input.reason}`,
          input.revisionId,
        ],
      );
      const newRevisionId = newRevisionResult.rows[0]!.id;

      await client.query(
        `UPDATE articles
            SET current_content = $2,
                current_revision_id = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [maybeArticle.id, maybeSourceRevision.content, newRevisionId],
      );

      await createKarmaEvent(
        {
          userId: req.user!.id,
          actorUserId: req.user!.id,
          eventType: "valid_revert_performed",
          reason: `Reverted revision ${input.revisionId} on ${slug}`,
          metadata: { articleId: maybeArticle.id, revisionId: newRevisionId },
        },
        client,
      );

      await createKarmaEvent(
        {
          userId: maybeSourceRevision.editor_id,
          actorUserId: req.user!.id,
          eventType: "edit_reverted",
          reason: `Your edit was reverted on ${slug}`,
          metadata: {
            articleId: maybeArticle.id,
            sourceRevisionId: input.revisionId,
            revertRevisionId: newRevisionId,
          },
        },
        client,
      );

      await client.query("COMMIT");
      res.json({
        revision: {
          id: newRevisionId,
          revertedRevisionId: input.revisionId,
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

export { articlesRouter };
