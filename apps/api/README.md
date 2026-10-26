# apps/api

Snip's HTTP API: an image goes in, validated LaTeX comes out. Express 5 + TypeScript, built
on [`@snip/engine`](../../packages/engine). Design and contract:
[docs/desktop-v0.md §5.2](../../docs/desktop-v0.md).

**Status: M2.** Local only, with no auth yet (accounts and quotas are a later phase).

## Run

```sh
npm run dev:api       # from the repo root; restarts on file changes
```

Reads `GEMINI_API_KEY` from the repo-root `.env`. Optional: `PORT` (default `8790`) and
`HOST` (default `127.0.0.1`, loopback only).

## API

```
POST /v1/recognize          body: raw PNG/JPEG/WebP bytes (≤ 10 MB)
200 { "latex": "...", "engine": "gemini-3.5-flash-lite", "ms": 1180 }
400 invalid_image   413 image_too_large   422 no_math_found
502 upstream_failed 500 internal_error    → { "error": "<code>", "message": "..." }

GET /healthz → { "status": "ok" }
```

- The image type comes from the file's leading bytes; the `Content-Type` header is ignored.
- Engines: Gemini 3.5 Flash-Lite, falling back to 3.8 Flash only when the output does not
  render in KaTeX. Each has a 10 s timeout (Gemini's minimum) and 1 retry.
- `422` means every engine answered but found no renderable math. `502` means an engine
  errored, so the client should offer a retry.
- Every response carries an `X-Request-Id` header, and each request logs one JSON line
  (id, status, ms, engine, failure detail). Image data is never logged.

Try it:

```sh
curl -X POST http://127.0.0.1:8790/v1/recognize --data-binary @equation.png
```

## Code

| Path               | What                                                        |
| ------------------ | ----------------------------------------------------------- |
| `src/app.ts`       | Express app factory: routes, error mapping, request logging |
| `src/recognize.ts` | Maps engine-router outcomes to API results                  |
| `src/image.ts`     | Image type detection from magic bytes                       |
| `src/config.ts`    | Environment validation (zod)                                |
| `src/server.ts`    | Entry point: wires real Gemini engines and starts listening |

Tests (`test/`) cover every status code with a fake recognizer and never call Gemini.
