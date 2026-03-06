# Security Review Snapshot

## Authentication and authorization

- Magic links are one-time-use and expire.
- No password login endpoint is implemented.
- Anonymous users can read but cannot perform write operations.
- Role guards enforce moderator/admin actions.
- Ban action remains admin-only.
- Admin audit logs endpoint is admin-only.

## Abuse protections

- Auth endpoints use rate limiting.
- Karma engine blocks duplicate events within a configurable window.
- Low-friction positive karma events are capped daily.
- Duplicate/cap suppressions are tracked as abuse signals for moderator visibility.

## Runtime security smoke command

```bash
npm run security:smoke
```

The script verifies:
- anonymous write blocked
- moderator ban blocked
- admin audit logs accessible for admin and blocked for moderator
