import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { runMigrations } from "../db/migrate.js";
import { pool } from "../db/pool.js";

const app = createApp();

const resetDatabase = async (): Promise<void> => {
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await runMigrations();
};

const uniqueEmail = (prefix: string): string => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return `${prefix}-${suffix}@example.com`;
};

const requestMagicLinkToken = async (email: string): Promise<string> => {
  const response = await request(app)
    .post("/api/auth/magic-link/request")
    .send({ email });

  expect(response.status).toBe(201);
  expect(typeof response.body.token).toBe("string");
  return response.body.token as string;
};

const loginWithMagicLink = async (
  email: string,
): Promise<{
  token: string;
  user: { id: number; email: string; role: string; status: string };
}> => {
  const magicToken = await requestMagicLinkToken(email);
  const verifyResponse = await request(app)
    .post("/api/auth/magic-link/verify")
    .send({ token: magicToken });

  expect(verifyResponse.status).toBe(200);
  return verifyResponse.body as {
    token: string;
    user: { id: number; email: string; role: string; status: string };
  };
};

describe("API integration", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates revisions and karma events when article is edited", async () => {
    const auth = await loginWithMagicLink(uniqueEmail("editor"));

    const createResponse = await request(app)
      .post("/api/articles")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        slug: "integration-edit",
        title: "Integration Edit",
        content: "hello\nworld",
        summary: "init",
      });
    expect(createResponse.status).toBe(201);

    const editResponse = await request(app)
      .put("/api/articles/integration-edit")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        content: "hello\nworld updated",
        summary: "expanded",
      });
    expect(editResponse.status).toBe(200);

    const historyResponse = await request(app).get("/api/articles/integration-edit/history");
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.revisions).toHaveLength(2);

    const karmaResponse = await request(app).get(`/api/karma/users/${auth.user.id}`);
    expect(karmaResponse.status).toBe(200);
    expect(
      karmaResponse.body.ledger.some(
        (entry: { eventType: string }) => entry.eventType === "article_created",
      ),
    ).toBe(true);
    expect(
      karmaResponse.body.ledger.some(
        (entry: { eventType: string }) => entry.eventType === "article_edited",
      ),
    ).toBe(true);
  });

  it("applies moderation revert karma effects", async () => {
    const adminEmail = "admin@example.com";
    const adminAuthInitial = await loginWithMagicLink(adminEmail);
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [adminEmail]);
    const adminAuth = await loginWithMagicLink(adminEmail);
    expect(adminAuthInitial.user.email).toBe(adminEmail);

    const editorAuth = await loginWithMagicLink(uniqueEmail("editor-revert"));
    const createResponse = await request(app)
      .post("/api/articles")
      .set("Authorization", `Bearer ${editorAuth.token}`)
      .send({
        slug: "integration-revert",
        title: "Integration Revert",
        content: "first version",
        summary: "init",
      });
    expect(createResponse.status).toBe(201);

    const editResponse = await request(app)
      .put("/api/articles/integration-revert")
      .set("Authorization", `Bearer ${editorAuth.token}`)
      .send({
        content: "second version",
        summary: "update",
      });
    expect(editResponse.status).toBe(200);

    const historyResponse = await request(app).get(
      "/api/articles/integration-revert/history",
    );
    expect(historyResponse.status).toBe(200);
    const newestRevisionId = historyResponse.body.revisions[0].id as number;

    const moderationResponse = await request(app)
      .post("/api/moderation/actions")
      .set("Authorization", `Bearer ${adminAuth.token}`)
      .send({
        targetUserId: editorAuth.user.id,
        actionType: "revert",
        reasonType: "policy_violation",
        note: "integration revert",
        articleSlug: "integration-revert",
        revisionId: newestRevisionId,
      });
    expect(moderationResponse.status).toBe(201);

    const karmaResponse = await request(app).get(`/api/karma/users/${editorAuth.user.id}`);
    expect(karmaResponse.status).toBe(200);
    expect(
      karmaResponse.body.ledger.some(
        (entry: { eventType: string }) => entry.eventType === "edit_reverted",
      ),
    ).toBe(true);
  });

  it("supports passkey login sessions and has no password endpoint", async () => {
    const auth = await loginWithMagicLink(uniqueEmail("passkey"));
    const credentialId = `cred-${Date.now()}`;

    const createPasskeyResponse = await request(app)
      .post("/api/auth/passkeys")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({
        name: "Integration Device",
        credentialId,
        publicKey: "integration-public-key",
      });
    expect(createPasskeyResponse.status).toBe(201);

    const passkeyLoginResponse = await request(app)
      .post("/api/auth/passkeys/login")
      .send({ credentialId });
    expect(passkeyLoginResponse.status).toBe(200);
    expect(typeof passkeyLoginResponse.body.token).toBe("string");

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${passkeyLoginResponse.body.token as string}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(auth.user.email);

    const passwordEndpointResponse = await request(app).post("/api/auth/password/login");
    expect(passwordEndpointResponse.status).toBe(404);
  });

  it("records duplicate-event abuse signals", async () => {
    const adminEmail = "admin@example.com";
    await loginWithMagicLink(adminEmail);
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [adminEmail]);
    const adminAuth = await loginWithMagicLink(adminEmail);

    const targetAuth = await loginWithMagicLink(uniqueEmail("duplicate-signal"));

    const firstWarning = await request(app)
      .post("/api/moderation/actions")
      .set("Authorization", `Bearer ${adminAuth.token}`)
      .send({
        targetUserId: targetAuth.user.id,
        actionType: "warn",
        reasonType: "policy_violation",
        note: "duplicate-signal-note",
      });
    expect(firstWarning.status).toBe(201);

    const secondWarning = await request(app)
      .post("/api/moderation/actions")
      .set("Authorization", `Bearer ${adminAuth.token}`)
      .send({
        targetUserId: targetAuth.user.id,
        actionType: "warn",
        reasonType: "policy_violation",
        note: "duplicate-signal-note",
      });
    expect(secondWarning.status).toBe(201);

    const signalsResponse = await request(app)
      .get(`/api/karma/signals?userId=${targetAuth.user.id}`)
      .set("Authorization", `Bearer ${adminAuth.token}`);
    expect(signalsResponse.status).toBe(200);
    expect(
      signalsResponse.body.signals.some(
        (signal: { signalType: string }) => signal.signalType === "duplicate_event",
      ),
    ).toBe(true);
  });
});
