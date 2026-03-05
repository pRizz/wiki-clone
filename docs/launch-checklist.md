# MVP Launch Checklist

## Infrastructure

- [x] API container definition
- [x] Web container definition
- [x] Docker Compose local/self-host baseline
- [x] Render deployment blueprint
- [x] Fly.io deployment configs

## Quality Gates

- [x] Type checking passes (`npm run typecheck`)
- [x] Automated tests pass (`npm run test`)
- [x] Production builds pass (`npm run build`)
- [x] CI workflow configured for PR + push

## Core Product Behavior

- [x] Public read access for articles
- [x] Authenticated article create/edit/revision history
- [x] Revision diff preview and revert
- [x] Discussion threads + comments + voting
- [x] Karma ledger with configurable decay/weights
- [x] Suspicious behavior flag listing for moderators/admins
- [x] Moderation actions with admin-only ban
- [x] Admin audit logs for privileged actions

## Hardening

- [x] Structured request/error logs
- [x] Optional Sentry integration for errors/spans
- [x] Auth rate limiting
- [x] Security headers via Helmet
- [x] Basic performance smoke tests for hot paths

## Manual Pre-Launch Verification

- [ ] Configure production secrets (`DATABASE_URL`, `JWT_SECRET`, `SENTRY_DSN`, `APP_ORIGIN`)
- [ ] Point web app to production API (`VITE_API_BASE_URL`)
- [ ] Seed initial admin account in production
- [ ] Verify public and authenticated flows in deployed environment
