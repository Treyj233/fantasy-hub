# Fantasy Hub Social Agent

Dedicated Cloudflare Agent for monitoring NFL news and publishing concise Fantasy Hub–style fantasy impact posts to X.

## Safety defaults

- Starts in `preview` mode and cannot post until explicitly changed to `live`.
- Only accepts HTTPS feed items with a source URL.
- Rejects rumor/speculation language.
- Ignores items older than 18 hours.
- Deduplicates stories in Durable Object SQLite.
- Enforces a 45-minute minimum gap and eight-post daily cap.
- Keeps admin routes behind a timing-safe bearer token.

## Required X setup

Create an X developer project/app with permission to read and write posts. Generate user-context credentials for the Fantasy Hub X account, then store them as Worker secrets:

```sh
npx wrangler secret put ADMIN_TOKEN --config social-agent/wrangler.jsonc
npx wrangler secret put X_API_KEY --config social-agent/wrangler.jsonc
npx wrangler secret put X_API_SECRET --config social-agent/wrangler.jsonc
npx wrangler secret put X_ACCESS_TOKEN --config social-agent/wrangler.jsonc
npx wrangler secret put X_ACCESS_TOKEN_SECRET --config social-agent/wrangler.jsonc
```

Deploy in preview mode, call `POST /admin/start`, and review `GET /admin/status`. Change `POSTING_MODE` to `live` only after the drafts and sources look right.

## Commands

```sh
npm run social:types
npm run social:check
npm run social:deploy
```
