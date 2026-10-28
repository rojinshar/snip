# CLAUDE.md: everything an agent needs to work on Snip

Read this file first. It is the single source of truth for how the project is built, deployed,
released and operated, including the quirks that are not obvious from the code. Deeper design
rationale is in `docs/desktop-v0.md` (the app) and `docs/beta-v1.md` (hosting, keys, quotas,
auto-update, self-registration). Keep this file current: when you change how something works,
update the relevant section in the same commit.

Last full review: 2026-10-28 (desktop 0.7.1).

---

## 1. What Snip is

A macOS menu-bar app: press a hotkey (default ⌘⇧2), drag a box over an equation anywhere on
screen, and LaTeX lands on the clipboard in about 3 seconds. The capture goes to our API,
which asks Google Gemini to transcribe it and checks the result renders with KaTeX before
returning it.

- **Business shape:** a small passive-income SaaS by one author (Rojin Sharma), aimed at STEM
  students, launched via Reddit. Keep fixed costs near zero and the scope small. No
  enterprise patterns.
- **Status (2026-10-28):** public beta. Anyone can download the app from
  https://snip.rojinsharma.com, and it sets itself up with 200 free snips a month. There's no
  account, no email and no payment yet. The planned pricing on the site (Student $2.99/mo,
  Lifetime $29 for waitlist members) is **not built**. Payments plus sign-in (OAuth) come
  together later.
- **Public URLs:**
  - Website: https://snip.rojinsharma.com (Cloudflare Worker `snip-web`)
  - API: https://api.snip.rojinsharma.com (Cloudflare Worker `snip-api`)
  - Downloads: https://downloads.snip.rojinsharma.com (Cloudflare R2 bucket `snip-releases`)
- **Public contact email** (privacy page): `sharmarojin48@gmail.com`.

---

## 2. Repository layout

npm workspaces monorepo (`packages/*`, `apps/*`). Internal packages are consumed as
TypeScript source (`exports` → `src/index.ts`); there is no build step for them.

```
apps/
  api/        Express 5 API: POST /v1/recognize, GET /v1/me, POST /v1/register.
              Runs on Cloudflare Workers (src/worker.ts) and locally on Node (src/server.ts).
  desktop/    Tauri 2 macOS menu-bar app. Rust in src-tauri/, settings window UI in ui/ (Vite,
              vanilla TS), UI tests in test/.
  web/        Next.js 16 website (landing, /download, /privacy, waitlist API), deployed to
              Cloudflare Workers with OpenNext.
  bench/      Accuracy/latency/cost benchmark of OCR engines. Writes to /results (git-ignored).
  unimernet-server/  Python: self-hosted UniMERNet model over HTTP. Experimental, not used in
              production (too slow on cheap servers; possible future on-device engine).
packages/
  engine/     OCR engines (Gemini, Mathpix, UniMERNet), the model router, LaTeX
              sanitize/validate/classify, scoring for the bench.
  db/         Postgres (Neon) schema migrations shared by web and api, and the migration runner.
docs/
  desktop-v0.md   App design (milestones M1–M5).
  beta-v1.md      Beta design: hosting, access keys, quotas, auto-update, self-registration (§15).
results/      Bench output, git-ignored.
```

---

## 3. Toolchain and local setup

- **Node 22+ is required** (`.nvmrc` says 22; wrangler refuses Node 20). **Quirk:** on the
  author's Mac the default shell Node is v20 (nvm). Most `npm` scripts still work on 20, but
  anything that runs `wrangler` (secrets, R2 uploads, `publish:desktop`, deploys) needs 22.
  Prefix with `PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH` or run `nvm use` first.
- **Rust stable plus the Xcode command-line tools** for the desktop app. The Cargo
  `rust-version` floor is 1.80.
- `npm install` at the root, then `cp .env.example .env` and fill it in.
- **Root `.env`** (git-ignored; never commit, never print values). Variable names:
  - `GEMINI_API_KEY`: paid-tier Google AI Studio key. The free tier was very slow (p50 6.6 s,
    with 503s), so paid is required.
  - `DATABASE_URL`: Neon Postgres connection string.
  - `MATHPIX_APP_ID`, `MATHPIX_APP_KEY`: optional, bench reference engine only.
  - `SNIP_ACCESS_KEY`: optional, a key for manual API testing.
  - `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`:
    signing and notarization (§9).
  - `TAURI_SIGNING_PRIVATE_KEY` (path), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: updater
    signing (§9).
  - Optional API overrides: `PORT`, `HOST`, `REQUIRE_ACCESS_KEYS`, `RATE_LIMIT_PER_MINUTE`,
    `DAILY_SPEND_CAP_USD`, `REGISTRATION_*`.

### Root scripts (`package.json`)

| Script                               | What it does                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `npm run check`                      | typecheck + lint + format:check + tests. **This is what CI runs.**               |
| `npm test` / `npm run test:watch`    | Vitest across `packages/*/test` and `apps/*/test` (no Rust)                      |
| `npm run typecheck`                  | `tsc -b` plus the web app's own `tsc --noEmit`                                   |
| `npm run lint`                       | ESLint (typescript-eslint strict)                                                |
| `npm run format` / `format:check`    | Prettier                                                                         |
| `npm run dev:api`                    | Local API on http://127.0.0.1:8790 (tsx watch), keys off by default              |
| `npm run dev:web`                    | Website on http://localhost:3100 (not 3000)                                      |
| `npm run dev:desktop`                | Desktop app in dev mode (debug build, uses the local API)                        |
| `npm run build:desktop`              | Ad-hoc-signed local build (not distributable); deletes the build-folder Snip.app |
| `npm run release:desktop`            | Signed + notarized `.dmg` and update archive (§9)                                |
| `npm run publish:desktop -- "notes"` | Upload release to R2 and write `latest.json` (§9)                                |
| `npm run reset:desktop-permission`   | Quit Snip, reset its Screen Recording grant, reopen /Applications/Snip.app       |
| `npm run db:migrate`                 | Apply new `packages/db/migrations/*.sql` to Neon (§6)                            |
| `npm run keys -- <cmd>`              | Access-key admin (§7)                                                            |
| `npm run bench -- ...`               | OCR benchmark (`apps/bench/README.md`)                                           |

**Rust is not run by CI.** Run it locally whenever you touch `apps/desktop/src-tauri`:

```sh
cd apps/desktop/src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
```

The settings-window TypeScript tests (`apps/desktop/test/hotkey.test.ts`) run with the root
`npm test`.

---

## 4. Engineering conventions (the author's standards)

- **Production-quality code.** Tests for behaviour changes, small focused commits, feature
  branches merged into `main` with `git merge --no-ff`, and design notes in `docs/` before big
  changes. No "vibe code".
- **Conventional Commits:** `feat(api): …`, `fix(web): …`, `chore(desktop): 0.7.0`,
  `release(desktop): 0.7.0`, `docs: …`. Branch names: `feat/…`, `fix/…`, `docs/…`.
  Merge-commit message style: `Merge branch 'feat/x': short summary`.
- **Never add AI attribution** to commits or PRs: no `Co-Authored-By: Claude`, no "Generated
  with" lines. Some old commits carry such trailers. Do not rewrite history to remove them
  unless the author explicitly confirms a force-push.
- **Match the surrounding style:** doc comments explain _why_, in plain English. TypeScript is
  strict ESM, with zod for config and input parsing and Node built-ins over dependencies.
  Rust: clippy clean with `-D warnings`, and pure functions split out for unit tests (for
  example `notification_for`, `check_due`, `parse_json`).
- **Tests never call paid APIs.** The opt-in e2e tests are `#[ignore]`d.
- **Prettier everything,** including docs (`npx prettier --write <file>`).
- **The privacy page makes promises the code must keep:** no analytics, no cookies, no ad
  trackers, no download tracking, and no storing of images or LaTeX. Do not add any of these
  without changing the privacy page and asking the author.
- **`apps/web/AGENTS.md`** is generated and re-added by `next dev` (Next.js agent rules: read
  `node_modules/next/dist/docs/` before writing Next code, since APIs differ from older
  Next). Leave it committed.

---

## 5. Architecture and request flow

```
⌘⇧2 → app checks Screen Recording permission → /usr/sbin/screencapture -i (macOS crosshair)
    → PNG in ~/Library/Caches/com.rojinsharma.snip/captures/ → downscale so the long edge is ≤ 2000 px
    → POST https://api.snip.rojinsharma.com/v1/recognize (raw PNG body, Bearer access key)
       → access check (key, quota, rate limit, spending cap) starts as the request arrives,
         overlapping the upload; Gemini is only called once it passes
       → OcrRouter: gemini-3.5-flash-lite → (only if that fails) gemini-3.8-flash
       → sanitize → classify (math | text) → validate with KaTeX → preserveLineBreaks for text
       → { latex, kind, engine, ms }; one usage row written after responding (waitUntil)
    → app wraps math in the user's delimiters (text is pasted as is) → clipboard
    → notification "Copied to clipboard" and ✓ next to the menu-bar icon for 2 s
```

### 5.1 Engine (`packages/engine`)

- **Gemini presets** (`src/engines/gemini.ts`, paid-tier list prices as of 2026-10):
  - `gemini-3.5-flash-lite`: $0.30 in / $2.50 out per M tokens, thinking MINIMAL. **The
    production primary.**
  - `gemini-3.8-flash`: $0.75 / $3.75, thinking LOW. **Fallback.** Its price doubles on
    2027-01-01 ($1.50 / $7.50); re-check the cost model then.
  - `gemini-3.1-flash-lite`: bench only.
  - Gemini 3 can't disable thinking.
- **API engine settings** (`apps/api/src/recognizer.ts`): `timeoutMs` 10 000 (Gemini rejects
  server deadlines under 10 s), and up to 2 attempts per model with 300–1000 ms backoff.
- **Typical cost** is about $0.0005–0.0007 per snip (≈1,200 input and ≈150 output tokens).
  Measured latency: p50 1.2 s, p95 1.9 s server-side.
- **`OcrRouter` (`src/router.ts`):**
  - Tries steps in order and accepts the first output that validates.
  - Errors, invalid output and low confidence fall through to the next step.
  - **Empty output stops the chain** (outcome `empty`, mapped to `422 no_math_found`). The
    prompt asks for empty output when there's no math. Escalating it to 3.8 Flash used to
    make "no math" snips take 4–5 s.
- **Prompt (`src/engines/prompt.ts`):** formulas only → bare LaTeX; text with math → plain
  text with `$…$` / `$$…$$`; never wrap prose in `\text{}`.
- **`latex/segments.ts`** holds the **kind** system:
  - `classifyOutput` returns `text` when the output contains delimited math, or has ≥ 4
    "prose words" (3+ letters, outside `\text{…}`-style commands and command arguments like
    `\begin{aligned}`). Otherwise it returns `math`.
  - Quirk: the `COMMAND_ARGUMENTS` regex exists because environment names (`aligned`,
    `pmatrix`) used to count as prose and misclassify multi-line math as text.
  - `preserveLineBreaks` turns single line breaks in a text snip's prose into blank lines, so
    lines don't merge when pasted into LaTeX or Markdown. It leaves math segments alone and
    does nothing if the prose contains `\begin{`.
- **`latex/sanitize.ts`** strips code fences and one outer delimiter layer only when the
  _whole_ output is a single formula. It doesn't unwrap `$a$ and $b$`.
- **`latex/validate.ts`:** `validateOutput` requires math to render whole in KaTeX
  (`strict: 'ignore'`). For text, delimiters must balance and each math segment must render.

### 5.2 API (`apps/api`)

- **Express 5.** The same `createApp()` runs on Node (`src/server.ts`, reads root `.env`) and
  on Workers (`src/worker.ts`, via `httpServerHandler` from `cloudflare:node`; `nodejs_compat`
  with a compatibility date after 2025-09-01 enables `node:http`). The Worker uses
  `waitUntil` so usage rows are written after the response.
- **Endpoints:**
  - **`GET /healthz`:** `{status:'ok'}`.
  - **`POST /v1/recognize`:**
    - Request: raw image body, max 10 MB. Type is detected from the bytes (PNG, JPEG, WebP),
      not the header. `Authorization: Bearer snip_…`.
    - Success: `200 {latex, kind, engine, ms}`.
  - **`GET /v1/me`:** `{quota, used, resetsAt}` for the key. Not rate-limited. Returns all
    nulls when access is off (local dev).
  - **`POST /v1/register`:**
    - No auth, no body.
    - Success: `201 {key, quota, used:0, resetsAt}`.
    - Errors: `429 registration_limited`, `403 registration_closed` (switched off, missing
      secret, or local dev without keys).
- **Error codes:**

  | Code                   | Status | Notes                      |
  | ---------------------- | ------ | -------------------------- |
  | `invalid_key`          | 401    |                            |
  | `quota_exceeded`       | 429    | includes `resetsAt`        |
  | `rate_limited`         | 429    |                            |
  | `capacity`             | 503    | the daily spending cap hit |
  | `invalid_image`        | 400    |                            |
  | `image_too_large`      | 413    |                            |
  | `no_math_found`        | 422    |                            |
  | `upstream_failed`      | 502    |                            |
  | `internal_error`       | 500    |                            |
  | `registration_limited` | 429    |                            |
  | `registration_closed`  | 403    |                            |

  The body is always `{error, message}`.

- **Access decision order** (`src/access.ts`): key exists and isn't revoked → monthly quota
  (successful snips this UTC calendar month) → rate limit (requests per key in the last 60 s,
  successful or not) → spending cap (all keys' Gemini cost since 00:00 UTC). The most
  specific reason wins. All checks come from **one SQL round trip** (`access-store.ts`).
  - Two simultaneous requests can both pass the quota check; going 1–2 over is accepted.
  - Every recognition that reached Gemini is recorded, success or not. Only `status = 200`
    counts toward the quota.
- **Logging:** one JSON line per request (id, path, status, ms, keyId, bytes, engine,
  attempts, detail). Never the image, the LaTeX, the key, or the IP. Workers Logs indexes it
  (`observability.enabled`).
- **Config:**
  - `wrangler.jsonc` vars (change and push to deploy):

    | Var                            | Value  | What                                       |
    | ------------------------------ | ------ | ------------------------------------------ |
    | `RATE_LIMIT_PER_MINUTE`        | 10     | requests per key per minute                |
    | `DAILY_SPEND_CAP_USD`          | 2      | about 2,800 snips/day across everyone      |
    | `REGISTRATION_OPEN`            | `true` | `false` = emergency brake for new installs |
    | `REGISTRATION_QUOTA`           | 200    | monthly quota of a self-registered key     |
    | `REGISTRATIONS_PER_IP_PER_DAY` | 3      |                                            |

  - Worker secrets: `GEMINI_API_KEY`, `DATABASE_URL`, `REGISTRATION_SECRET` (random hex; keys
    the IP HMAC; registration silently stays closed without it, logging an error).
  - Locally, `REQUIRE_ACCESS_KEYS` defaults to false so dev runs never write to the shared
    database; registration defaults to closed.
- **Domain:** `routes: [{ pattern: "api.snip.rojinsharma.com", custom_domain: true }]`.
  workers.dev and preview URLs are disabled, so that domain is the only public address.
- **Client IP** for the registration limit: the `CF-Connecting-IP` header (Cloudflare sets it
  and overwrites any client value), falling back to the socket address on Node.

### 5.3 Self-registration (docs/beta-v1.md §15)

The app gets its own key, so there's no invite or email flow.

- **On launch** (a background thread) and **before a snip** if there is still no key, the app
  calls `POST /v1/register` and saves the key to the `access-key` file. A process-wide mutex
  (`REGISTERING` in `access_key.rs`) stops launch and a first snip from both registering.
- **Server (one SQL statement):**
  - deletes `registrations` rows older than 1 day
  - counts this IP-hash's registrations in 24 h
  - inserts an `access_keys` row (`source='app'`, no email) only if under the limit
  - logs a `registrations` row
- **Privacy:** IPs are stored only as `HMAC-SHA-256(ip, REGISTRATION_SECRET)` for ≤ 24 h. The
  privacy page describes this as a "scrambled code". If you change the mechanism, update
  `apps/web/src/app/privacy/page.tsx`.
- **Abuse model:** worst case, someone farms keys from many IPs until the $2/day cap is hit,
  and everyone sees "Snip is busy" until midnight UTC. Bounded at $2.
- **Brakes:**
  - `REGISTRATION_OPEN: "false"` stops new installs; existing keys keep working.
  - Lower `REGISTRATIONS_PER_IP_PER_DAY` or `REGISTRATION_QUOTA` to slow growth.
- **Settings → Remove key:** the next snip auto-registers a fresh key (subject to the IP
  limit). A key pasted in Settings (for example from `npm run keys -- create`) replaces the
  registered one.
- **Not done:** attributing registrations to a `?ref=` campaign. The privacy page rules out
  download tracking. Future OAuth accounts should adopt the install's existing key.

---

## 6. Database (Neon Postgres)

- One Neon database is shared by the website (waitlist) and the API (keys, usage). Both use
  `@neondatabase/serverless` (the HTTP driver, which works on Workers with no pool). Counts
  and numerics arrive as **strings** over that driver, so they're parsed with
  `z.coerce.number()`.
- **Free tier quirk:** Neon suspends after about 5 min idle; waking adds a few hundred ms.
  That's why the access check overlaps the image upload.
- **Migrations** (`packages/db/migrations/NNNN_name.sql`, applied by `npm run db:migrate`):
  - They run in filename order, once each, recorded in `schema_migrations`.
  - Each file runs in one transaction.
  - **Quirk:** statements are split on `;` at line ends, so keep to plain DDL/DML. No
    functions or `DO` blocks with inner semicolons.
  - Migrations must stay backward compatible with the deployed API, because you migrate
    first, then deploy.
  - **Agent quirk:** the Claude Code permission classifier blocks `npm run db:migrate` as a
    production change. Ask the author to run it.
- **Tables:**
  - `waitlist_signups(id, email unique lowercase, source = ?ref= tag, created_at)`, from
    migration 0001.
  - `access_keys`, from 0002 and 0003:

    | Column          | What                                                                 |
    | --------------- | -------------------------------------------------------------------- |
    | `id`            |                                                                      |
    | `key_hash`      | hex SHA-256 of the full key, unique                                  |
    | `key_hint`      | last 4 chars                                                         |
    | `email`         | nullable since 0003                                                  |
    | `monthly_quota` |                                                                      |
    | `created_at`    |                                                                      |
    | `revoked_at`    |                                                                      |
    | `source`        | `'invite'` (made by script) or `'app'` (self-registered), since 0003 |

  - `snips(id, key_id → access_keys, created_at, status smallint, engine, input_tokens,
output_tokens, cost_usd numeric(12,8), ms)`. **Metadata only, never the image or LaTeX.**
    Indexed on `(key_id, created_at)` and `(created_at)`.
  - `registrations(ip_hash hex64, created_at)`, from 0003. Pruned on every registration.
- **Keys:** format `snip_` + 26 lowercase base32 characters (`a–z`, `2–7`), 130 bits. Only the
  SHA-256 is stored, so a key is shown once. The app validates the same format
  (`access_key::normalize`).

---

## 7. Operating the service

- **Key admin** (reads `DATABASE_URL` from env or root `.env`):

  ```sh
  npm run keys -- create --email someone@uni.edu [--quota 200]   # prints the key once
  npm run keys -- list                                            # id, hint, source, email, quota, used this month
  npm run keys -- quota --id 3 --quota 500
  npm run keys -- revoke --id 3
  ```

  Key id 1 is the author's own invite key (quota 100000). Ids 2–4 are revoked test keys.

- **Logs:** Cloudflare dashboard → Workers → `snip-api` → Logs, or `npx wrangler tail` from
  `apps/api` (Node 22).
- **Secrets:** run `npx wrangler secret put NAME` in `apps/api` (or `apps/web`) with Node 22.
  To generate and set without printing:
  `openssl rand -hex 32 | npx wrangler secret put REGISTRATION_SECRET`. The Claude Code
  classifier blocks agents from setting secrets, so ask the author to run it.
- **Spending:** watch `snips.cost_usd`. Raise `DAILY_SPEND_CAP_USD` in
  `apps/api/wrangler.jsonc` if real demand hits the cap.
- **Pending ops items (as of 2026-10-28):**
  - The Neon password should be reset at some point. Then update the root `.env`, the
    `snip-api` and `snip-web` `DATABASE_URL` secrets, and `.dev.vars` if any.
  - The author still has to back up the three signing keys listed in §9.

---

## 8. Deployment (Cloudflare)

Both Workers deploy automatically on push to `main` via **Cloudflare Workers Builds**,
configured in the dashboard rather than the repo. A push that touches no watched path
deploys nothing.

| Worker     | Root dir   | Watch paths                                            | Build                                |
| ---------- | ---------- | ------------------------------------------------------ | ------------------------------------ |
| `snip-api` | `apps/api` | `apps/api/*`, `packages/engine/*`, `package-lock.json` | `wrangler deploy` of `src/worker.ts` |
| `snip-web` | `apps/web` | `apps/web/*`, `package-lock.json`                      | OpenNext build + deploy              |

- **Changing `packages/db`** does not deploy anything. Migrations are run by hand.
- **Changing `packages/engine`** redeploys the API but not the website.
- **The website** runs on Workers through `@opennextjs/cloudflare` (`.open-next/worker.js` plus
  static assets). Worker secret: `DATABASE_URL` (for the waitlist API). Custom domain
  `snip.rojinsharma.com` (set in the dashboard).
- **Quirk: Workers static assets answer byte-range requests with `200` and the whole file.**
  iPhone Safari needs `206` to play video, so **the demo video is served from R2**
  (`https://downloads.snip.rojinsharma.com/site/snip-demo.mp4`), not `apps/web/public`.
  Upload a new cut with:
  `wrangler r2 object put snip-releases/site/snip-demo.mp4 --file <mp4> --remote`. The poster
  stays at `apps/web/public/snip-demo-poster.jpg`.
- **Order matters for cross-cutting changes:** migrate DB → deploy API → release the app →
  switch the website. The site should never point users at an app that needs an API feature
  that isn't live yet.

---

## 9. Desktop releases, signing and auto-update

### 9.1 Identity and signing material

- **Bundle identifier:** `com.rojinsharma.snip`. **Never change it.** It keys the Screen
  Recording grant, the Application Support folder, and the login item.
- **Apple Developer:** organization account "Simple Storage LLC", team `2S5B4HX685`.
  Certificate: "Developer ID Application: Simple Storage LLC (2S5B4HX685)", in the author's
  login keychain.
- **Notarization:** App Store Connect API key, a `.p8` at `~/.appstoreconnect/AuthKey_<KEYID>.p8`.
  The issuer and key IDs are in `.env`.
- **Updater signing key:** Ed25519/minisign at `~/.tauri/snip-updater.key`, password in
  `.env`. Its public half is `plugins.updater.pubkey` in
  `apps/desktop/src-tauri/tauri.conf.json`. **If this key is lost, installed copies can never
  auto-update again** (users would have to reinstall manually). Keep it backed up with the
  Developer ID `.p12` and the `.p8`.
- `tauri.conf.json` has `signingIdentity: "-"` (ad hoc) for `build:desktop`. The release
  script overrides it through `APPLE_SIGNING_IDENTITY`.

### 9.2 Releasing a new version

1. Bump the version in **three places**: `apps/desktop/src-tauri/Cargo.toml`,
   `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/package.json`. Run `cargo check`
   to refresh `Cargo.lock`, and **commit `Cargo.lock`** (forgetting it once blocked a merge).
   Commit as `chore(desktop): X.Y.Z`.
2. `npm run release:desktop` (`apps/desktop/scripts/release.sh`) takes about 5–15 min,
   mostly Apple's notary queue:
   - Re-execs itself under `caffeinate -i`, so a sleeping Mac doesn't kill notarization.
   - Reads only the `APPLE_*`/`TAURI_SIGNING_*` lines from `.env` and checks the identity
     exists.
   - Detaches leftover `/Volumes/dmg.*` from failed runs, which otherwise give "Resource
     busy".
   - Runs `CI=true npx tauri build`. `CI=true` skips Tauri's Finder-AppleScript dmg styling,
     which opened a window mid-build and failed if touched.
   - Tauri signs (hardened runtime) and notarizes the app. The script then signs, notarizes
     and staples the `.dmg`, and verifies with `codesign`, `stapler` and `spctl`.
   - **Deletes the build-folder `Snip.app`**, so Spotlight doesn't list a second Snip. The
     author once launched that copy, and a later release deleted it from under the updater.
   - Outputs `target/release/bundle/dmg/Snip_X.Y.Z_aarch64.dmg` plus
     `bundle/macos/Snip.app.tar.gz` and its `.sig`.
3. `npm run publish:desktop -- "One-line notes"` (`scripts/publish.sh`, **Node 22**, uses
   wrangler from `apps/api`):
   - Uploads `desktop/X.Y.Z/Snip_X.Y.Z_aarch64.dmg` and `.app.tar.gz` to R2 with immutable
     caching.
   - Overwrites `desktop/latest/Snip.dmg` (no-cache), which the website's Download button
     links to. **New downloads get the new version immediately.**
   - Checks both URLs return 200.
   - Writes `apps/web/public/updates/latest.json` (version, notes, pub_date, darwin-aarch64
     signature and url). It refuses to republish an existing version.
4. Commit `latest.json` as `release(desktop): X.Y.Z` and push to `main`. That redeploys the
   website, which **is what releases the update to installed copies.** Rolling back the
   update feed means reverting that commit. `desktop/latest/Snip.dmg` must be re-uploaded
   separately if you roll back downloads.
5. The download page shows the version from the same `latest.json` (`apps/web/src/lib/release.ts`).

Apple silicon only (`aarch64`); no Intel/universal build yet. Minimum macOS 13.

### 9.3 Auto-update behaviour (`apps/desktop/src-tauri/src/updates.rs`)

- **Feed:** `https://snip.rojinsharma.com/updates/latest.json` (tauri-plugin-updater). The
  archive must be signed with the updater key, so a compromised download host can't push
  code.
- **Schedule:** first check **30 s after launch**, then whenever **6 hours** have passed on
  the **wall clock**. A background thread ticks every **10 min**, so a check that came due
  while the Mac slept runs within 10 min of waking. A clock moved backwards counts as due.
  **Debug builds never auto-check.**
- **Download:** a newer version is downloaded and verified in the background. A notification
  says "Snip X is ready to install" and the menu item becomes **Restart to Update to X**.
- **Install happens only** when the user picks Restart to Update, picks Restart Snip, or
  quits. **Never install in place while running.** Replacing the running app's files makes
  macOS silently drop that process's notifications (its on-disk identity no longer matches).
  That was a real bug fixed in 0.5.5.
- **Check for Updates…** (manual) reports "up to date" and errors. Background checks stay
  quiet.
- **What survives an update:** the Screen Recording grant (same identifier and team),
  settings, and the access key, all of which live outside the app bundle.

---

## 10. The desktop app in detail (`apps/desktop/src-tauri/src`)

| File                     | Responsibility                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `lib.rs`                 | App setup, tray menu, hotkey handler, snip pipeline, notifications (`notification_for`), ✓/! tray marks, background registration |
| `capture.rs`             | `/usr/sbin/screencapture -i` (exits 0 on Esc, with no file = Cancelled)                                                          |
| `image_prep.rs`          | Downscale so the long edge is ≤ `MAX_EDGE` 2000 px, re-encode PNG                                                                |
| `api.rs`                 | Blocking `ureq` client (45 s timeout): `recognize`, `me`, `register`. Any 2xx is success                                         |
| `access_key.rs`          | Key file (0600, atomic write), format check, `load_or_register`                                                                  |
| `welcome_window.rs`      | First-run window (§10.1): launch decision, setup commands, `SetupState` progress                                                 |
| `notification_access.rs` | Notification permission via Apple's UserNotifications framework: status, request, System Settings URL                            |
| `settings.rs`            | `settings.json`: `hotkey` (default `Cmd+Shift+Digit2`), `delimiters`, `openAtLoginSetUp`, `setup`                                |
| `settings_window.rs`     | Tauri commands for the Settings window (key status and usage, hotkey, delimiters, open at login, version)                        |
| `updates.rs`             | Auto-update (§9.3)                                                                                                               |
| `login_item.rs`          | Open at login via `SMAppService` (objc2-service-management)                                                                      |
| `permissions.rs`         | Screen Recording check and request (CoreGraphics preflight)                                                                      |
| `format.rs`              | `clipboard_text` (wrap math in delimiters, paste text as is), usage line, dates                                                  |
| `metrics.rs`             | Appends one JSON line per snip to `~/Library/Logs/com.rojinsharma.snip/snips.jsonl` (timings only)                               |

- **Files on the user's Mac:**
  - Settings: `~/Library/Application Support/com.rojinsharma.snip/settings.json`.
  - Access key: `…/com.rojinsharma.snip/access-key`, mode 0600. **Not the Keychain**, which
    prompted on every read with ad-hoc builds. The author called that unacceptable UX, so
    don't move it back without good reason.
  - Captures: `~/Library/Caches/com.rojinsharma.snip/captures/`, deleted after each snip
    unless `SNIP_KEEP_CAPTURES=1`.
- **API URL:** release builds use the production API; debug builds use
  `http://127.0.0.1:8790`. The `SNIP_API_URL` env var overrides both.
- **Menu-bar only:** `LSUIElement` in `Info.plist` plus the Accessory activation policy, so
  there's no Dock icon. The app never exits when its last window closes, only on Quit.
- **Tray menu:** Snip Equation (hotkey), Settings… ⌘,, version, Check for Updates… / Restart
  to Update, Restart Snip, Quit Snip.
- **Busy indicator:** `…` next to the icon while recognizing, then ✓ or ! for 2 s. Cancel shows
  nothing. A second hotkey press during a snip is ignored (`busy` AtomicBool).
- **Delimiters:** `$…$` (default), `\[…\]`, `$$…$$` or none, applied only to `kind: math`.
  `kind: text` is pasted as returned. Known gap: text snips keep `$…$` even when the user
  picked `\[…\]`.
- **Open at login:** a release build adds itself once on first run (`openAtLoginSetUp`
  records that). After that it's the user's choice in Settings or System Settings.
- **Notifications:** "Copied to clipboard" (title only). Errors are mapped to actionable text
  in `notification_for`. Key problems also open Settings.
- **Hotkey rules:** must include ⌘, ⌃ or ⌥ (Shift alone would hijack typing).
- **Old servers:** `Recognition.kind` defaults to `math` when missing.

### 10.1 The first-run window (0.7.1)

`welcome_window.rs` plus `ui/welcome.html`, `ui/src/welcome.ts` and `ui/src/setup-steps.ts`.
Vite builds two pages, `index.html` (Settings) and `welcome.html`.

- **Steps:** Welcome → Notifications → Screen Recording → (restart) → You're all set.
- **When it opens:** on launch, decided by `on_launch` from `settings.setup`:
  - `Done`: never opens.
  - `AwaitingRestart`: opens, landing on "all set".
  - `Pending` (the default, including settings written before 0.7.1) with both permissions
    already granted: marked done silently, so existing happy users never see it.
  - `Pending` with a permission missing: opens. This is how existing users with
    notifications off see it once.
- **Closing the window** (`CloseRequested`) counts as skip and marks it done. Quitting or
  restarting does not send `CloseRequested`.
- **Notifications:** the notification plugin can show notifications but can't ask for or
  read permission on macOS. `notification_access.rs` calls `UNUserNotificationCenter`
  directly to request, and reads `authorizationStatus` plus `alertStyle` (style None counts
  as off).
  - Status meanings: `notAsked`, `on`, `off`, `unavailable`.
  - **Quirk:** outside an `.app` bundle (`tauri dev`, `cargo test`) the framework throws an
    Objective-C exception that would abort the app. The code checks that the executable path
    contains `.app/Contents/MacOS/` and returns `Unavailable` otherwise.
  - While the notifications step is shown it polls every 1.5 s, so flipping the switch in
    System Settings updates it live.
- **Screen Recording:** the button calls `CGRequestScreenCaptureAccess` (which adds Snip to
  the list and shows macOS's prompt the first time), opens the list, and sets
  `setup = AwaitingRestart`.
  - The window polls `CGPreflightScreenCaptureAccess` every 1.5 s and restarts Snip itself if
    it turns true.
  - Otherwise macOS's own **Quit & Reopen** prompt, or the window's **Restart Snip** button,
    relaunches it. `AwaitingRestart` makes the window reopen on "all set".
  - The permission only takes effect after a relaunch.
- **The "all set" step** warns when notifications are off and points at the ✓ tray mark.
- **To see the window again** on a machine: remove `"setup"` from `settings.json`, or set it
  to `"pending"`, and revoke a permission.

### 10.2 macOS permission and notification quirks (hard-won)

- **Screen Recording** only takes effect after the app relaunches. The app opens System
  Settings at most once per launch and tells the user to choose **Restart Snip**.
- **Unsigned or ad-hoc rebuilds** get a new code identity, so a previous TCC grant silently
  stops matching. Fix with `npm run reset:desktop-permission`. Signed releases don't have this
  problem. **Don't run the reset script on the author's machine without asking**: it wipes
  their grant.
- **Stale LaunchServices records** (for example from an old bundle identifier or build-folder
  copies) can make TCC misattribute requests. Fix:
  `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u <stale.app>`,
  then `-gc`, then `-f /Applications/Snip.app`. Or add Snip manually with "+" in System
  Settings → Privacy & Security → Screen Recording.
- **Notifications are hidden while screen sharing or recording** (macOS "displayShared"
  policy). That's not a bug. Users can enable System Settings → Notifications → "Allow
  notifications when mirroring or sharing the display". The ✓/! tray mark exists for this
  reason.
- **In zsh, `log` is a shell builtin.** Use `/usr/bin/log show --predicate …` for system logs.

---

## 11. Website (`apps/web`)

- **Stack:** Next.js 16 (App Router), React 19, Tailwind 4, `@opennextjs/cloudflare`. Dev
  server on **port 3100**.
- **Pages:**
  - `/`: landing page. Hero **Download for Mac**, "Free · No sign-up · Apple silicon Macs ·
    Screenshots are never stored", demo video, comparison with Mathpix/ChatGPT, pricing
    (planned), FAQ, founder note, and a bottom section with Download plus an optional email
    form ("lifetime deal at launch, or Windows").
  - `/download`: download button and setup steps.
  - `/privacy`: the promises listed in §4.
- **API route:** `POST /api/waitlist` (`src/lib/waitlist.ts`, `neon-waitlist-repository.ts`).
  It has a honeypot field `website`, and stores the email plus `source` (the `?ref=` tag).
- **Shared components:**
  - `site-nav.tsx`: sticky nav rendered once in `layout.tsx`. Its button is **Download
    free**. Quirk: the logo click on `/` scrolls to top manually, because a link to the
    current page does nothing.
  - `download-action.tsx`: platform-aware button using `useSyncExternalStore`, rendering the
    Mac button on the server.
    - **Mac:** downloads the `.dmg` and shows "Your download is starting" guidance.
    - **Phone:** "Open this page on your Mac" plus Copy link.
    - **Windows/Linux:** "Notify me" → `/#signup`.
  - `waitlist-form.tsx`: the email form. With `id="signup"` its input is `#signup-email`,
    which `/#signup` focuses.
- **Referral tags:** `?ref=reddit-xyz` is captured by `src/lib/ref.ts` into sessionStorage
  and sent with waitlist sign-ups. It isn't attached to downloads or app registrations
  (privacy promise).
- **Demo video (`demo.tsx`):**
  - Served from R2, as explained in §8.
  - Playback starts from script, not the `autoplay` attribute, so reduced-motion users get
    a click-to-play poster.
  - **Quirk:** the `muted` _attribute_ is set imperatively, because iPhone Safari checks it
    and React only sets the property.
  - If `play()` is refused (Low Power Mode), a ▶ overlay appears.
  - If the video errors, it falls back to a static example.
- `<html data-scroll-behavior="smooth">` is set so Next restores scroll correctly on
  navigation; without it, going home landed at the bottom.
- **Copy facts to keep consistent:** "about 3 seconds" (hotkey to paste, real measurement),
  200 free snips/month, Mathpix numbers in `src/lib/mathpix.ts` (with a checked date).
- **Release info:** `src/lib/release.ts` provides `DOWNLOAD_URL` (R2 `desktop/latest/Snip.dmg`)
  and `LATEST_VERSION` (from `public/updates/latest.json`).

---

## 12. Benchmarking (`apps/bench`)

- `npm run bench -- --dataset <manifest.jsonl> --engines gemini-3.5-flash-lite,router,mathpix`.
  Results go to `/results/<timestamp>/` (`summary.md`, `summary.json`, `predictions.jsonl`).
- **Datasets:** `apps/bench/data/*` is git-ignored (personal course material) except
  `sample/`. `bench:import-unimer` imports UniMER-style sets; `bench:rescore` re-scores saved
  predictions.
- **Key result (2026-10-26, 200 UniMER images, paid key):** Flash-Lite p50 1.2 s, p95 1.9 s,
  0 errors, about $0.0005/snip. UniMERNet-Tiny is about 0.4 s on an M-series Mac but 7–15 s
  on a Raspberry Pi 5, so it isn't viable on cheap servers. It remains a possible on-device
  engine later.

---

## 13. Version history (desktop)

- **0.5.x:**
  - signed and notarized builds
  - auto-update
  - the access key moved from the Keychain to a file
  - notification fixes
  - 0.5.5: install updates only on restart or quit
- **0.6.0:**
  - `math`/`text` kinds
  - empty output stops the router (fast "no equation found")
  - Open at login
  - 6-hourly update checks
- **0.7.0:** self-registration. No access key or invite needed (API `POST /v1/register`,
  migration 0003).
- **0.7.1:** first-run window: welcome, notification permission, Screen Recording, auto
  restart. A tester had notifications off and never saw "Copied to clipboard".

---

## 14. Ideas noted but not built

- **Shrink captures more before upload,** so the hotkey-to-paste time returns to about 2 s
  (hosted server time is about 1.2–1.6 s; the rest is upload and client time).
- **Convert text-snip `$…$`** to `\(…\)` when the user's delimiter setting is `\[…\]`.
- **Accounts (OAuth) and payments** (Stripe): Student plan, and Lifetime for waitlist members.
  Accounts should adopt existing install keys.
- **More platforms:** Windows, a Chrome extension, an Obsidian plugin, Intel/universal macOS
  builds.
- **Handwriting and long multi-line equations:** "in testing" per the FAQ.
