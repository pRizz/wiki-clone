CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  suspended_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS magic_links (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passkeys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  current_content TEXT NOT NULL,
  current_revision_id BIGINT,
  author_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_revisions (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  editor_id BIGINT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  summary TEXT,
  is_revert BOOLEAN NOT NULL DEFAULT FALSE,
  reverted_revision_id BIGINT REFERENCES article_revisions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE articles
    ADD CONSTRAINT articles_current_revision_fk
    FOREIGN KEY (current_revision_id) REFERENCES article_revisions(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS discussion_threads (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  creator_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discussion_comments (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id BIGINT NOT NULL,
  voter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(target_type, target_id, voter_id)
);

CREATE TABLE IF NOT EXISTS karma_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id),
  event_type TEXT NOT NULL,
  points INT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS karma_config (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id BIGINT NOT NULL REFERENCES users(id),
  action_type TEXT NOT NULL,
  reason_type TEXT NOT NULL,
  note TEXT NOT NULL,
  target_revision_id BIGINT REFERENCES article_revisions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
