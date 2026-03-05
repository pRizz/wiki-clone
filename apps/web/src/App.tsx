import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ApiClient } from "./lib/apiClient";
import { captureException, logger, startUiSpan } from "./lib/observability";
import "./App.css";

type BasicUser = {
  id: number;
  email: string;
  role: string;
  status: string;
};

type DiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
};

type ManagedUser = {
  id: number;
  email: string;
  role: "user" | "editor" | "mod" | "admin";
  status: "active" | "suspended" | "banned";
  suspendedUntil: string | null;
};

const tokenStorageKey = "wiki.token";

function App() {
  const [statusMessage, setStatusMessage] = createSignal("Ready.");
  const [token, setToken] = createSignal<string | null>(
    localStorage.getItem(tokenStorageKey),
  );
  const [email, setEmail] = createSignal("admin@example.com");
  const [magicToken, setMagicToken] = createSignal("");
  const [issuedMagicToken, setIssuedMagicToken] = createSignal("");
  const [viewer, setViewer] = createSignal<BasicUser | null>(null);
  const [passkeyName, setPasskeyName] = createSignal("Laptop");
  const [passkeyCredentialId, setPasskeyCredentialId] = createSignal("");
  const [passkeyPublicKey, setPasskeyPublicKey] = createSignal("");
  const [passkeys, setPasskeys] = createSignal<
    Array<{ id: number; name: string; credentialId: string }>
  >([]);

  const [articles, setArticles] = createSignal<Array<{ slug: string; title: string }>>([]);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<
    Array<{ slug: string; title: string; excerpt: string }>
  >([]);
  const [selectedSlug, setSelectedSlug] = createSignal("");
  const [articleTitle, setArticleTitle] = createSignal("");
  const [articleContent, setArticleContent] = createSignal("");
  const [articleSummary, setArticleSummary] = createSignal("");
  const [history, setHistory] = createSignal<
    Array<{ id: number; editorId: number; summary: string | null }>
  >([]);
  const [diffFromRevisionId, setDiffFromRevisionId] = createSignal("");
  const [diffToRevisionId, setDiffToRevisionId] = createSignal("");
  const [diffLines, setDiffLines] = createSignal<DiffLine[]>([]);

  const [threadTitle, setThreadTitle] = createSignal("General thread");
  const [threads, setThreads] = createSignal<Array<{ id: number; title: string }>>([]);
  const [selectedThreadId, setSelectedThreadId] = createSignal<number | null>(null);
  const [commentContent, setCommentContent] = createSignal("");
  const [comments, setComments] = createSignal<Array<{ id: number; content: string }>>([]);

  const [karmaUserId, setKarmaUserId] = createSignal("");
  const [karmaTotals, setKarmaTotals] = createSignal<{
    positive: number;
    negative: number;
    decayedPositive: number;
    total: number;
  } | null>(null);
  const [karmaLedger, setKarmaLedger] = createSignal<
    Array<{ id: number; eventType: string; points: number; reason: string }>
  >([]);
  const [moderationTargetUserId, setModerationTargetUserId] = createSignal("");
  const [moderationActionType, setModerationActionType] = createSignal<
    "warn" | "suspend" | "ban" | "revert"
  >("warn");
  const [moderationNote, setModerationNote] = createSignal("Policy violation note");
  const [moderationSuspendHours, setModerationSuspendHours] = createSignal("24");
  const [moderationArticleSlug, setModerationArticleSlug] = createSignal("");
  const [moderationRevisionId, setModerationRevisionId] = createSignal("");
  const [moderationActions, setModerationActions] = createSignal<
    Array<{
      id: number;
      actionType: string;
      targetUserId: number;
      actorUserId: number;
      note: string;
    }>
  >([]);
  const [moderationQueueItems, setModerationQueueItems] = createSignal<
    Array<{
      itemType: "revision" | "comment";
      itemId: number;
      authorId: number;
      articleSlug: string;
      preview: string;
      score: number;
      createdAt: string;
    }>
  >([]);
  const [abuseSignals, setAbuseSignals] = createSignal<
    Array<{
      id: number;
      userId: number;
      signalType: string;
      reason: string;
      createdAt: string;
    }>
  >([]);
  const [managedUsers, setManagedUsers] = createSignal<ManagedUser[]>([]);
  const [roleDraftByUserId, setRoleDraftByUserId] = createSignal<Record<number, ManagedUser["role"]>>({});
  const [statusDraftByUserId, setStatusDraftByUserId] = createSignal<
    Record<number, ManagedUser["status"]>
  >({});
  const [karmaConfigEditor, setKarmaConfigEditor] = createSignal(
    JSON.stringify(
      {
        weights: {},
        decay: {},
        antiAbuse: {},
      },
      null,
      2,
    ),
  );
  const [adminAuditLogs, setAdminAuditLogs] = createSignal<
    Array<{
      id: number;
      actionType: string;
      targetEntity: string;
      targetId: string | null;
      createdAt: string;
    }>
  >([]);

  const apiClient = createMemo(() => new ApiClient(token()));
  const hasModerationAccess = createMemo(() => {
    const maybeUser = viewer();
    return maybeUser?.role === "mod" || maybeUser?.role === "admin";
  });
  const hasAdminAccess = createMemo(() => viewer()?.role === "admin");

  const storeToken = (nextToken: string | null): void => {
    setToken(nextToken);
    if (nextToken) {
      localStorage.setItem(tokenStorageKey, nextToken);
      return;
    }

    localStorage.removeItem(tokenStorageKey);
  };

  const callApi = async <T,>(
    action: string,
    fn: () => Promise<T>,
    onSuccess?: (value: T) => void,
  ): Promise<void> => {
    try {
      const value = await startUiSpan(action, fn);
      onSuccess?.(value);
      setStatusMessage(`${action} succeeded.`);
    } catch (error) {
      captureException(error);
      logger.error(logger.fmt`UI action failed: ${action}`, {
        action,
      });
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`${action} failed: ${message}`);
    }
  };

  const refreshViewer = async (): Promise<void> => {
    if (!token()) {
      setViewer(null);
      setPasskeys([]);
      return;
    }

    await callApi(
      "Auth refresh",
      () => apiClient().request<{ user: BasicUser }>("/auth/me"),
      async (data) => {
        setViewer(data.user);
        await callApi(
          "Load passkeys",
          () =>
            apiClient().request<{
              passkeys: Array<{ id: number; name: string; credentialId: string }>;
            }>("/auth/passkeys"),
          (passkeyData) => setPasskeys(passkeyData.passkeys),
        );
      },
    );
  };

  const refreshArticles = async (): Promise<void> => {
    await callApi(
      "Load articles",
      () => apiClient().request<{ articles: Array<{ slug: string; title: string }> }>("/articles"),
      (data) => setArticles(data.articles),
    );
  };

  const runSearch = async (): Promise<void> => {
    const query = searchQuery().trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    await callApi(
      "Search articles",
      () =>
        apiClient().request<{
          results: Array<{ slug: string; title: string; excerpt: string }>;
        }>(`/search?query=${encodeURIComponent(query)}`),
      (data) => setSearchResults(data.results),
    );
  };

  const refreshCurrentArticle = async (): Promise<void> => {
    if (!selectedSlug()) {
      return;
    }

    await callApi(
      "Load article",
      () => apiClient().request<{ article: { title: string; content: string } }>(`/articles/${selectedSlug()}`),
      (data) => {
        setArticleTitle(data.article.title);
        setArticleContent(data.article.content);
      },
    );

    await callApi(
      "Load revision history",
      () =>
        apiClient().request<{
          revisions: Array<{ id: number; editorId: number; summary: string | null }>;
        }>(`/articles/${selectedSlug()}/history`),
      (data) => setHistory(data.revisions),
    );

    await callApi(
      "Load discussions",
      () => apiClient().request<{ threads: Array<{ id: number; title: string }> }>(`/articles/${selectedSlug()}/discussions`),
      (data) => setThreads(data.threads),
    );
  };

  const refreshComments = async (): Promise<void> => {
    if (!selectedThreadId()) {
      setComments([]);
      return;
    }

    await callApi(
      "Load comments",
      () =>
        apiClient().request<{ comments: Array<{ id: number; content: string }> }>(
          `/discussions/${selectedThreadId()}/comments`,
        ),
      (data) => setComments(data.comments),
    );
  };

  const refreshModerationActions = async (): Promise<void> => {
    if (!hasModerationAccess()) {
      setModerationActions([]);
      setModerationQueueItems([]);
      setAbuseSignals([]);
      return;
    }

    await callApi(
      "Load moderation actions",
      () =>
        apiClient().request<{
          actions: Array<{
            id: number;
            actionType: string;
            targetUserId: number;
            actorUserId: number;
            note: string;
          }>;
        }>("/moderation/actions"),
      (data) => setModerationActions(data.actions),
    );

    await callApi(
      "Load moderation queue",
      () =>
        apiClient().request<{
          items: Array<{
            itemType: "revision" | "comment";
            itemId: number;
            authorId: number;
            articleSlug: string;
            preview: string;
            score: number;
            createdAt: string;
          }>;
        }>("/moderation/queue"),
      (data) => setModerationQueueItems(data.items),
    );

    await callApi(
      "Load abuse signals",
      () =>
        apiClient().request<{
          signals: Array<{
            id: number;
            userId: number;
            signalType: string;
            reason: string;
            createdAt: string;
          }>;
        }>(
          moderationTargetUserId()
            ? `/karma/signals?userId=${moderationTargetUserId()}`
            : "/karma/signals",
        ),
      (data) => setAbuseSignals(data.signals),
    );
  };

  const refreshManagedUsers = async (): Promise<void> => {
    if (!hasAdminAccess()) {
      setManagedUsers([]);
      return;
    }

    await callApi(
      "Load users",
      () =>
        apiClient().request<{
          users: ManagedUser[];
        }>("/users"),
      (data) => {
        setManagedUsers(data.users);
        setRoleDraftByUserId(
          Object.fromEntries(data.users.map((user) => [user.id, user.role])),
        );
        setStatusDraftByUserId(
          Object.fromEntries(data.users.map((user) => [user.id, user.status])),
        );
      },
    );
  };

  const refreshKarmaConfig = async (): Promise<void> => {
    if (!hasAdminAccess()) {
      return;
    }

    await callApi(
      "Load karma config",
      () =>
        apiClient().request<{
          config: unknown;
        }>("/karma/config"),
      (data) => setKarmaConfigEditor(JSON.stringify(data.config, null, 2)),
    );
  };

  const refreshAdminAuditLogs = async (): Promise<void> => {
    if (!hasAdminAccess()) {
      setAdminAuditLogs([]);
      return;
    }

    await callApi(
      "Load admin audit logs",
      () =>
        apiClient().request<{
          logs: Array<{
            id: number;
            actionType: string;
            targetEntity: string;
            targetId: string | null;
            createdAt: string;
          }>;
        }>("/admin/logs"),
      (data) => setAdminAuditLogs(data.logs),
    );
  };

  const updateUser = async (userId: number): Promise<void> => {
    await callApi(
      "Update user",
      () =>
        apiClient().request(`/users/${userId}`, {
          method: "PATCH",
          body: {
            role: roleDraftByUserId()[userId],
            status: statusDraftByUserId()[userId],
          },
        }),
      () => void refreshManagedUsers(),
    );
  };

  const saveKarmaConfig = async (): Promise<void> => {
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(karmaConfigEditor());
    } catch (_error) {
      setStatusMessage("Save karma config failed: invalid JSON");
      return;
    }

    await callApi(
      "Save karma config",
      () =>
        apiClient().request("/karma/config", {
          method: "PUT",
          body: parsedConfig,
        }),
      () => void refreshKarmaConfig(),
    );
  };

  createEffect(() => {
    void refreshViewer();
  });

  createEffect(() => {
    void refreshArticles();
  });

  createEffect(() => {
    if (!selectedSlug()) {
      return;
    }

    void refreshCurrentArticle();
  });

  createEffect(() => {
    void refreshComments();
  });

  createEffect(() => {
    void refreshModerationActions();
  });

  createEffect(() => {
    if (!hasAdminAccess()) {
      setManagedUsers([]);
      setAdminAuditLogs([]);
      return;
    }

    void refreshManagedUsers();
    void refreshKarmaConfig();
    void refreshAdminAuditLogs();
  });

  return (
    <main class="layout">
      <h1>Wiki Clone · SolidJS + Express</h1>
      <p class="status">{statusMessage()}</p>

      <section class="panel">
        <h2>Authentication (email + magic link + passkey CRUD)</h2>
        <div class="row">
          <input
            aria-label="Email"
            value={email()}
            onInput={(event) => setEmail(event.currentTarget.value)}
            placeholder="Email"
          />
          <button
            onClick={() =>
              void callApi(
                "Request magic link",
                () => apiClient().request<{ token?: string }>("/auth/magic-link/request", { method: "POST", body: { email: email() } }),
                (data) => setIssuedMagicToken(data.token ?? ""),
              )
            }
          >
            Request Magic Link
          </button>
        </div>
        <Show when={issuedMagicToken()}>
          <p class="mono">Dev token: {issuedMagicToken()}</p>
        </Show>
        <div class="row">
          <input
            aria-label="Magic link token"
            value={magicToken()}
            onInput={(event) => setMagicToken(event.currentTarget.value)}
            placeholder="Magic link token"
          />
          <button
            onClick={() =>
              void callApi(
                "Verify magic link",
                () => apiClient().request<{ token: string; user: BasicUser }>("/auth/magic-link/verify", { method: "POST", body: { token: magicToken() } }),
                (data) => {
                  storeToken(data.token);
                  setViewer(data.user);
                },
              )
            }
          >
            Login via Magic Link
          </button>
          <button onClick={() => storeToken(null)}>Logout</button>
        </div>

        <Show when={viewer()}>
          {(activeViewer) => (
            <div class="stack">
              <p>
                Signed in as <strong>{activeViewer().email}</strong> ({activeViewer().role})
              </p>
              <div class="row">
                <input
                  aria-label="Passkey name"
                  value={passkeyName()}
                  onInput={(event) => setPasskeyName(event.currentTarget.value)}
                  placeholder="Passkey name"
                />
                <input
                  aria-label="Passkey credential ID"
                  value={passkeyCredentialId()}
                  onInput={(event) => setPasskeyCredentialId(event.currentTarget.value)}
                  placeholder="Credential ID"
                />
                <input
                  aria-label="Passkey public key"
                  value={passkeyPublicKey()}
                  onInput={(event) => setPasskeyPublicKey(event.currentTarget.value)}
                  placeholder="Public key"
                />
                <button
                  onClick={() =>
                    void callApi(
                      "Create passkey",
                      () =>
                        apiClient().request("/auth/passkeys", {
                          method: "POST",
                          body: {
                            name: passkeyName(),
                            credentialId: passkeyCredentialId(),
                            publicKey: passkeyPublicKey(),
                          },
                        }),
                      () => void refreshViewer(),
                    )
                  }
                >
                  Add Passkey
                </button>
              </div>

              <ul>
                <For each={passkeys()}>
                  {(passkey) => (
                    <li>
                      <span class="mono">{passkey.name} · {passkey.credentialId}</span>
                      <button onClick={() => void callApi("Passkey login", () => apiClient().request<{ token: string }>("/auth/passkeys/login", { method: "POST", body: { credentialId: passkey.credentialId } }), (data) => storeToken(data.token))}>Login</button>
                      <button onClick={() => void callApi("Delete passkey", () => apiClient().request(`/auth/passkeys/${passkey.id}`, { method: "DELETE" }), () => void refreshViewer())}>Delete</button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </Show>
      </section>

      <section class="panel">
        <h2>Articles · Revisions · Revert</h2>
        <div class="row">
          <input
            aria-label="Search articles"
            value={searchQuery()}
            onInput={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search title, slug, or content"
          />
          <button onClick={() => void runSearch()}>Search</button>
        </div>
        <Show when={searchResults().length > 0}>
          <ul>
            <For each={searchResults()}>
              {(result) => (
                <li>
                  <button onClick={() => setSelectedSlug(result.slug)}>{result.slug}</button> ·{" "}
                  {result.title}
                  <div>{result.excerpt}</div>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div class="row">
          <input
            aria-label="Article slug"
            value={selectedSlug()}
            onInput={(event) => setSelectedSlug(event.currentTarget.value)}
            placeholder="Article slug (e.g. open-source)"
          />
          <button onClick={() => void refreshCurrentArticle()}>Load article</button>
        </div>
        <div class="row">
          <input
            aria-label="Article title"
            value={articleTitle()}
            onInput={(event) => setArticleTitle(event.currentTarget.value)}
            placeholder="Article title"
          />
          <input
            aria-label="Article edit summary"
            value={articleSummary()}
            onInput={(event) => setArticleSummary(event.currentTarget.value)}
            placeholder="Edit summary"
          />
        </div>
        <textarea
          aria-label="Article content"
          rows={8}
          value={articleContent()}
          onInput={(event) => setArticleContent(event.currentTarget.value)}
        />
        <div class="row">
          <button onClick={() => void callApi("Create article", () => apiClient().request("/articles", { method: "POST", body: { slug: selectedSlug(), title: articleTitle(), content: articleContent(), summary: articleSummary() } }), () => void refreshArticles())}>Create</button>
          <button onClick={() => void callApi("Edit article", () => apiClient().request(`/articles/${selectedSlug()}`, { method: "PUT", body: { content: articleContent(), summary: articleSummary() } }), () => void refreshCurrentArticle())}>Save edit</button>
        </div>
        <p>Recent articles:</p>
        <ul>
          <For each={articles()}>
            {(article) => (
              <li>
                <button onClick={() => setSelectedSlug(article.slug)}>{article.slug}</button> · {article.title}
              </li>
            )}
          </For>
        </ul>

        <h3>Revision history</h3>
        <ul>
          <For each={history()}>
            {(revision) => (
              <li>
                #{revision.id} by user {revision.editorId} · {revision.summary ?? "No summary"}
                <button onClick={() => void callApi("Revert revision", () => apiClient().request(`/articles/${selectedSlug()}/revert`, { method: "POST", body: { revisionId: revision.id, reason: "Manual revert from UI" } }), () => void refreshCurrentArticle())}>Revert</button>
                <button onClick={() => void callApi("Upvote revision", () => apiClient().request("/votes", { method: "POST", body: { targetType: "revision", targetId: revision.id, value: 1 } }))}>Upvote</button>
                <button onClick={() => void callApi("Downvote revision", () => apiClient().request("/votes", { method: "POST", body: { targetType: "revision", targetId: revision.id, value: -1 } }))}>Downvote</button>
              </li>
            )}
          </For>
        </ul>
        <div class="row">
          <input
            aria-label="From revision ID"
            value={diffFromRevisionId()}
            onInput={(event) => setDiffFromRevisionId(event.currentTarget.value)}
            placeholder="From revision ID"
          />
          <input
            aria-label="To revision ID"
            value={diffToRevisionId()}
            onInput={(event) => setDiffToRevisionId(event.currentTarget.value)}
            placeholder="To revision ID"
          />
          <button
            onClick={() =>
              void callApi(
                "Load diff preview",
                () =>
                  apiClient().request<{ lines: DiffLine[] }>(
                    `/articles/${selectedSlug()}/diff?fromRevisionId=${diffFromRevisionId()}&toRevisionId=${diffToRevisionId()}`,
                  ),
                (data) => setDiffLines(data.lines),
              )
            }
          >
            Compare revisions
          </button>
          <button
            onClick={() =>
              void callApi(
                "Load latest diff preview",
                () =>
                  apiClient().request<{ lines: DiffLine[] }>(
                    `/articles/${selectedSlug()}/diff`,
                  ),
                (data) => setDiffLines(data.lines),
              )
            }
          >
            Compare latest pair
          </button>
        </div>
        <Show when={diffLines().length > 0}>
          <div class="diff-container mono">
            <For each={diffLines()}>
              {(line) => (
                <div class={`diff-line diff-${line.type}`}>
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                  {line.text}
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h2>Discussion threads</h2>
        <div class="row">
          <input
            aria-label="Discussion thread title"
            value={threadTitle()}
            onInput={(event) => setThreadTitle(event.currentTarget.value)}
            placeholder="New thread title"
          />
          <button onClick={() => void callApi("Create thread", () => apiClient().request(`/articles/${selectedSlug()}/discussions`, { method: "POST", body: { title: threadTitle() } }), () => void refreshCurrentArticle())}>Create thread</button>
        </div>
        <ul>
          <For each={threads()}>
            {(thread) => (
              <li>
                <button onClick={() => setSelectedThreadId(thread.id)}>#{thread.id}</button> {thread.title}
              </li>
            )}
          </For>
        </ul>
        <Show when={selectedThreadId()}>
          <div class="stack">
            <div class="row">
              <input
                aria-label="Discussion comment content"
                value={commentContent()}
                onInput={(event) => setCommentContent(event.currentTarget.value)}
                placeholder="Comment content"
              />
              <button onClick={() => void callApi("Post comment", () => apiClient().request(`/discussions/${selectedThreadId()}/comments`, { method: "POST", body: { content: commentContent() } }), () => void refreshComments())}>Post</button>
            </div>
            <ul>
              <For each={comments()}>
                {(comment) => (
                  <li>
                    #{comment.id} {comment.content}
                    <button onClick={() => void callApi("Upvote comment", () => apiClient().request("/votes", { method: "POST", body: { targetType: "comment", targetId: comment.id, value: 1 } }))}>Upvote</button>
                    <button onClick={() => void callApi("Downvote comment", () => apiClient().request("/votes", { method: "POST", body: { targetType: "comment", targetId: comment.id, value: -1 } }))}>Downvote</button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h2>Karma ledger</h2>
        <div class="row">
          <input
            aria-label="Karma user ID"
            value={karmaUserId()}
            onInput={(event) => setKarmaUserId(event.currentTarget.value)}
            placeholder="User ID"
          />
          <button
            onClick={() =>
              void callApi(
                "Load karma",
                () =>
                  apiClient().request<{
                    totals: {
                      positive: number;
                      negative: number;
                      decayedPositive: number;
                      total: number;
                    };
                    ledger: Array<{
                      id: number;
                      eventType: string;
                      points: number;
                      reason: string;
                    }>;
                  }>(`/karma/users/${karmaUserId()}`),
                (data) => {
                  setKarmaTotals(data.totals);
                  setKarmaLedger(data.ledger);
                },
              )
            }
          >
            Load ledger
          </button>
        </div>
        <Show when={karmaTotals()}>
          {(totals) => (
            <div class="stack">
              <p>Total karma: {totals().total}</p>
              <p>Positive raw: {totals().positive}</p>
              <p>Negative raw: {totals().negative}</p>
              <p>Decayed positive: {totals().decayedPositive}</p>
            </div>
          )}
        </Show>
        <ul>
          <For each={karmaLedger()}>
            {(item) => (
              <li>
                #{item.id} {item.eventType} ({item.points}) — {item.reason}
              </li>
            )}
          </For>
        </ul>
      </section>

      <Show when={hasModerationAccess()}>
        <section class="panel">
          <h2>Moderation actions</h2>
          <div class="row">
            <input
              aria-label="Moderation target user ID"
              value={moderationTargetUserId()}
              onInput={(event) => setModerationTargetUserId(event.currentTarget.value)}
              placeholder="Target user ID"
            />
            <select
              aria-label="Moderation action type"
              value={moderationActionType()}
              onInput={(event) =>
                setModerationActionType(
                  event.currentTarget.value as "warn" | "suspend" | "ban" | "revert",
                )
              }
            >
              <option value="warn">Warn</option>
              <option value="suspend">Suspend</option>
              <option value="ban">Ban</option>
              <option value="revert">Revert</option>
            </select>
            <input
              aria-label="Suspension duration in hours"
              value={moderationSuspendHours()}
              onInput={(event) => setModerationSuspendHours(event.currentTarget.value)}
              placeholder="Suspend hours"
            />
            <input
              aria-label="Moderation revert article slug"
              value={moderationArticleSlug()}
              onInput={(event) => setModerationArticleSlug(event.currentTarget.value)}
              placeholder="Revert article slug"
            />
            <input
              aria-label="Moderation revert revision ID"
              value={moderationRevisionId()}
              onInput={(event) => setModerationRevisionId(event.currentTarget.value)}
              placeholder="Revert revision ID"
            />
          </div>
          <div class="row">
            <input
              aria-label="Moderation note"
              value={moderationNote()}
              onInput={(event) => setModerationNote(event.currentTarget.value)}
              placeholder="Moderation note"
            />
            <button
              onClick={() =>
                void callApi(
                  "Submit moderation action",
                  () =>
                    apiClient().request("/moderation/actions", {
                      method: "POST",
                      body: {
                        targetUserId: Number(moderationTargetUserId()),
                        actionType: moderationActionType(),
                        reasonType: "policy_violation",
                        note: moderationNote(),
                        suspendHours: Number(moderationSuspendHours()),
                        articleSlug: moderationArticleSlug() || undefined,
                        revisionId: moderationRevisionId()
                          ? Number(moderationRevisionId())
                          : undefined,
                      },
                    }),
                  () => void refreshModerationActions(),
                )
              }
            >
              Submit action
            </button>
            <button onClick={() => void refreshModerationActions()}>Refresh actions</button>
          </div>
          <ul>
            <For each={moderationActions()}>
              {(action) => (
                <li>
                  #{action.id} {action.actionType} target={action.targetUserId} by=
                  {action.actorUserId} — {action.note}
                </li>
              )}
            </For>
          </ul>
          <h3>Moderation queue (recent revisions/comments)</h3>
          <ul>
            <For each={moderationQueueItems()}>
              {(item) => (
                <li>
                  {item.itemType} #{item.itemId} article={item.articleSlug} author=
                  {item.authorId} score={item.score} — {item.preview} ({item.createdAt})
                </li>
              )}
            </For>
          </ul>
          <h3>Suspicious behavior flags</h3>
          <ul>
            <For each={abuseSignals()}>
              {(signal) => (
                <li>
                  #{signal.id} user={signal.userId} {signal.signalType} — {signal.reason} (
                  {signal.createdAt})
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={hasAdminAccess()}>
        <section class="panel">
          <h2>Admin · User role/status CRUD</h2>
          <button onClick={() => void refreshManagedUsers()}>Refresh users</button>
          <ul>
            <For each={managedUsers()}>
              {(managedUser) => (
                <li>
                  #{managedUser.id} {managedUser.email}
                  <div class="row">
                    <select
                      aria-label={`Role for user ${managedUser.id}`}
                      value={roleDraftByUserId()[managedUser.id] ?? managedUser.role}
                      onInput={(event) =>
                        setRoleDraftByUserId((current) => ({
                          ...current,
                          [managedUser.id]: event.currentTarget.value as ManagedUser["role"],
                        }))
                      }
                    >
                      <option value="user">user</option>
                      <option value="editor">editor</option>
                      <option value="mod">mod</option>
                      <option value="admin">admin</option>
                    </select>
                    <select
                      aria-label={`Status for user ${managedUser.id}`}
                      value={statusDraftByUserId()[managedUser.id] ?? managedUser.status}
                      onInput={(event) =>
                        setStatusDraftByUserId((current) => ({
                          ...current,
                          [managedUser.id]: event.currentTarget.value as ManagedUser["status"],
                        }))
                      }
                    >
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                      <option value="banned">banned</option>
                    </select>
                    <button onClick={() => void updateUser(managedUser.id)}>
                      Apply updates
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="panel">
          <h2>Admin · Karma configuration JSON</h2>
          <div class="row">
            <button onClick={() => void refreshKarmaConfig()}>Refresh config</button>
            <button onClick={() => void saveKarmaConfig()}>Save config</button>
          </div>
          <textarea
            aria-label="Karma configuration JSON"
            rows={18}
            value={karmaConfigEditor()}
            onInput={(event) => setKarmaConfigEditor(event.currentTarget.value)}
          />
        </section>

        <section class="panel">
          <h2>Admin · Audit log</h2>
          <button onClick={() => void refreshAdminAuditLogs()}>Refresh logs</button>
          <ul>
            <For each={adminAuditLogs()}>
              {(log) => (
                <li>
                  #{log.id} {log.actionType} {log.targetEntity}
                  {log.targetId ? `(${log.targetId})` : ""} at {log.createdAt}
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </main>
  );
}

export default App;
