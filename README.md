# Wiki Clone (SolidJS + Express + PostgreSQL)

Wikipedia-style collaborative site with:

- Public read access, authenticated edits
- Article CRUD with immutable revision history + revert
- Discussion threads and comments
- Revision/comment voting
- Configurable karma engine with visible ledger
- Suspicious behavior flags for duplicate-suppressed and cap-suppressed karma activity
- Moderation actions (warn/suspend/ban/revert), with admin-only bans
- Moderation queue feed for recent revisions/comments with vote score
- Admin audit log for privileged moderation/config/user-management actions
- Email magic link auth + passkey CRUD and passkey login

## Monorepo Layout

- `apps/web`: SolidJS frontend
- `apps/api`: Express API + PostgreSQL persistence
- `packages/shared`: shared validation schemas and domain constants
- `infra`: Docker Compose, Render, and Fly deployment configs

## Local Development

### Option A: Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build
```

- Web: `http://localhost:4173`
- API: `http://localhost:4000`

### Option B: Run services directly

```bash
cp .env.example .env
npm install
docker run --name wiki-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=wiki_clone -p 5432:5432 -d postgres:16-alpine
npm run --workspace @wiki/api dev
npm run --workspace @wiki/web dev
```

Seed an admin user:

```bash
ADMIN_EMAIL=admin@example.com npm run --workspace @wiki/api seed:admin
```

## Authentication Notes

- No password authentication is implemented.
- Magic links are requested via `/api/auth/magic-link/request`.
- In non-production, the raw token is returned in the API response to streamline local testing.
- Passkeys support CRUD metadata + passkey login endpoint.

## Karma Defaults (Configurable)

Defaults are defined in `packages/shared/src/index.ts` and stored in `karma_config` on first boot.

- Positive: article create/edit, upvotes, comments, valid reverts
- Negative: downvotes, reverted edits, policy warning/suspension/ban
- Decay: enabled, 14-day grace, 1% weekly

## Observability

- Structured JSON request/error logs are emitted by the API.
- Optional Sentry error/performance telemetry is enabled when `SENTRY_DSN` is set.
- Optional frontend Sentry telemetry is enabled when `VITE_SENTRY_DSN` is set.
- Article create/edit flows are instrumented with custom spans.

## Security Notes

- Input validation is enforced with shared Zod schemas on all write endpoints.
- Role-based authorization gates privileged endpoints.
- API security headers are enabled via `helmet`.
- Auth endpoints are protected by request rate limiting to mitigate abuse.
- Privileged actions are captured in `/api/admin/logs` audit trail.

## Launch Readiness

- Launch checklist: `docs/launch-checklist.md`

## Testing

```bash
npm run typecheck
npm run test
```

Runtime smoke scripts:

```bash
npm run e2e:smoke
npm run perf:smoke
npm run perf:edit-smoke
npm run security:smoke
```
