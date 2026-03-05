# Runtime Validation Notes

## Automated checks

- `npm run typecheck` passes
- `npm run test` passes
- `npm run build` passes

## Repeatable smoke scripts

- End-to-end flow script: `npm run e2e:smoke`
  - Auth (magic link)
  - Article create/edit/history/diff
  - Discussion create/comment
  - Voting
  - Moderation action
  - Search and karma ledger verification
- Performance smoke script: `npm run perf:smoke`
  - `/health`
  - `/api/articles`
  - `/api/karma/users/:id`

## Example e2e summary output

```json
{
  "slug": "smoke-article-1772751789",
  "articleId": 10,
  "revisionCount": 2,
  "diffLineCount": 4,
  "threadId": 5,
  "commentId": 4,
  "moderationActionId": 5,
  "searchResults": 1,
  "karmaTotal": 6,
  "ledgerEntries": 6
}
```

## Example perf smoke snapshot

- `/health` (3s @ 15 conns): ~10.2k req/s avg, 99th latency ~5ms
- `/api/articles` (3s @ 15 conns): ~5.0k req/s avg, 99th latency ~10ms
- `/api/karma/users/1` (3s @ 15 conns): ~2.2k req/s avg, 99th latency ~13ms
