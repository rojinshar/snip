# apps/api

Snip's HTTP API: an image goes in, validated LaTeX comes out. Express 5 + TypeScript, built
on [`@snip/engine`](../../packages/engine). Design and contract:
[docs/desktop-v0.md §5.2](../../docs/desktop-v0.md) and
[docs/beta-v1.md §3–6](../../docs/beta-v1.md).

**Status: B2.** Live at `https://api.snip.rojinsharma.com` (Cloudflare Worker `snip-api`),
with per-tester access keys, monthly quotas, a rate limit and a daily spending cap.

## Run

```sh
npm run dev:api       # from the repo root; restarts on file changes
```

Reads the repo-root `.env`:

| Variable                | Default             | What                                                      |
| ----------------------- | ------------------- | --------------------------------------------------------- |
| `GEMINI_API_KEY`        | required            | Gemini API key                                            |
| `PORT`, `HOST`          | `8790`, `127.0.0.1` | Local listener (loopback only)                            |
| `REQUIRE_ACCESS_KEYS`   | `false`             | Check keys and record usage locally; needs `DATABASE_URL` |
| `DATABASE_URL`          | none                | Neon Postgres ([`packages/db`](../../packages/db))        |
| `RATE_LIMIT_PER_MINUTE` | `10`                | Recognitions per key per minute                           |
| `DAILY_SPEND_CAP_USD`   | `2`                 | Gemini spend across all keys per UTC day                  |

Keys are off locally by default, so local runs never write usage rows to the shared
database.

## Deploy

Pushes to `main` that touch `apps/api`, `packages/engine` or `package-lock.json` deploy
automatically (Cloudflare Workers Builds, root directory `apps/api`). `src/worker.ts` runs the
same Express app through Workers' `node:http` support. Secrets, set with
`npx wrangler secret put`: `GEMINI_API_KEY`, `DATABASE_URL`. Limits are `vars` in
`wrangler.jsonc`.

## Access keys

```sh
npm run keys -- create --email tester@uni.edu [--quota 200]   # prints the key once
npm run keys -- list                                          # usage this month per key
npm run keys -- quota --id 3 --quota 500
npm run keys -- revoke --id 3
```

Only a key's SHA-256 is stored. Every recognition writes one metadata row to `snips`
(status, engine, tokens, cost, ms), never the image or the LaTeX.

## API

```
POST /v1/recognize          Authorization: Bearer snip_…   body: raw PNG/JPEG/WebP (≤ 10 MB)
200 { "latex": "...", "kind": "math", "engine": "gemini-3.5-flash-lite", "ms": 1180 }
400 invalid_image    401 invalid_key      413 image_too_large   422 no_math_found
429 quota_exceeded (+ "resetsAt")         429 rate_limited
502 upstream_failed  503 capacity         500 internal_error
    → { "error": "<code>", "message": "..." }

GET /v1/me                  Authorization: Bearer snip_…
200 { "quota": 200, "used": 37, "resetsAt": "2026-12-01T00:00:00.000Z" }
    (all null when keys are off locally)   401 invalid_key

GET /healthz → { "status": "ok" }
```

- Key, quota, rate limit and spending cap are checked before the image is read, so a
  rejected request costs nothing. Quotas count successful snips per calendar month (UTC).
- `kind`: `math` is bare LaTeX (the app adds the user's delimiters); `text` is prose with
  `$…$` math, pasted as is. Each math segment of `text` must render in KaTeX.
- The image type comes from the file's leading bytes; the `Content-Type` header is ignored.
- Engines: Gemini 3.5 Flash-Lite, falling back to 3.8 Flash only when the output does not
  render in KaTeX. Each has a 10 s timeout (Gemini's minimum) and 1 retry.
- `422` means every engine answered but found no renderable math. `502` means an engine
  errored, so the client should offer a retry.
- Every response carries an `X-Request-Id` header, and each request logs one JSON line
  (id, key id, status, ms, bytes, engine, attempts with tokens). Image data and LaTeX are
  never logged.

## Code

| Path                  | What                                                         |
| --------------------- | ------------------------------------------------------------ |
| `src/app.ts`          | Express app: routes, access checks, usage recording, logging |
| `src/access.ts`       | Access rules (key, quota, rate limit, spending cap)          |
| `src/access-store.ts` | Neon queries: one usage lookup per request, one insert after |
| `src/keys.ts`         | Key generation and hashing                                   |
| `src/recognize.ts`    | Maps engine-router outcomes to API results                   |
| `src/recognizer.ts`   | The Gemini engine chain, shared by both entry points         |
| `src/image.ts`        | Image type detection from magic bytes                        |
| `src/config.ts`       | Environment validation (zod)                                 |
| `src/server.ts`       | Node entry point (local development)                         |
| `src/worker.ts`       | Cloudflare Workers entry point (production)                  |
| `scripts/keys.ts`     | `npm run keys` admin commands                                |

Tests (`test/`) cover every status code and access rule with fakes, and never call Gemini or
the database.
