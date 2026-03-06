# Test Suite Map

## Unit + Integration

- API unit tests: `apps/api/src/**/*.test.ts`
- API integration tests: `apps/api/src/integration/api.integration.test.ts`
  - Includes moderation queue/actions, passkey, admin-audit, abuse-signal, and magic-link one-time-use assertions
- Shared package tests: `packages/shared/src/**/*.test.ts` (add as needed)

## Runtime Smoke

- End-to-end smoke script: `npm run e2e:smoke`
- Performance smoke script: `npm run perf:smoke`
- Edit latency smoke script: `npm run perf:edit-smoke`
- Security smoke script: `npm run security:smoke`

## Full validation command sequence

```bash
npm run typecheck
npm run test
npm run build
npm run e2e:smoke
npm run perf:smoke
```
