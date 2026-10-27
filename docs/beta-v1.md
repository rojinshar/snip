# Snip beta (v1): design

- **Status:** accepted
- **Author:** Rojin Sharma
- **Last updated:** 2026-10-26

## 1. Goal

Let people from the waitlist use Snip on their own Macs without running anything but the
app, while keeping the author's costs small and capped.

**Done means:**

1. The API runs at a stable public URL. Release builds of the app use it by default.
2. Each tester has their own access key, pasted once into Settings.
3. Each key has a monthly snip quota (default 200). The settings window shows usage.
4. A daily spending cap stops all recognition if usage spikes, so a leaked key or a bug
   can never run up a large bill.
5. Hosted latency stays within 300 ms of the local API (p50 measured on 20 snips).
6. A signed and notarized `.dmg` installs on a second Mac without security warnings.
7. Ten waitlist users have snipped real coursework with it.

## 2. Non-goals (beta)

Payments, email sign-in, self-serve sign-up, auto-update, Windows, team accounts, and
storing images or LaTeX on the server. Payments and sign-in come together in the launch
phase, since a checkout already collects an email address.

## 3. Hosting

The API is a thin HTTP layer over `@snip/engine`. It needs outbound HTTPS to Gemini, about
1–3 s of waiting per request, little CPU, and no local disk.

| Option                     | Fixed cost                                    | Code changes                        | Cold starts             | Notes                                                   |
| -------------------------- | --------------------------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------- |
| **Cloudflare Workers**     | $0 (Free), or $5/month (Paid) if CPU needs it | A Worker entry point; Express stays | None                    | Same account and push-to-deploy as the website          |
| Fly.io                     | About $2–3/month for a small VM               | None (Docker image)                 | None (always on)        | One region; a VM to size and keep patched               |
| Railway                    | About $5/month, usage-based                   | None (Docker image)                 | None (always on)        | Similar to Fly.io                                       |
| Render (free)              | $0                                            | None                                | 30 s or more after idle | Sleeps when idle; unusable for a hotkey tool            |
| A small VPS (e.g. Hetzner) | About €4/month                                | None                                | None                    | Cheapest always-on, but we run the OS, TLS and restarts |
| Google Cloud Run           | $0 within the free tier                       | None (Docker image)                 | 1–3 s after idle        | A cold start on the first snip breaks the 2 s goal      |

**Recommendation: Cloudflare Workers.** It adds no new platform: the website already
deploys there on push to `main`. It never cold-starts, it runs close to the user, and time
spent waiting on Gemini is not billed, only CPU time. Workers run Express apps unchanged
through Node.js HTTP compatibility (`nodejs_compat`, compatibility date 2025-09-01 or
later), so `apps/api` keeps Express and its tests. B1 adds a Worker entry point that builds
the app from Worker secrets instead of `.env`.

**A separate Worker, not the website's.** The API deploys as its own Worker (`snip-api`) in
the same Cloudflare account, not as routes inside the website's Next.js Worker
(`snip-web`). Each deploys, rolls back and fails on its own: a landing-page change cannot
break the app's API, and the Gemini key is never in the website's environment. Both share
the same Workers plan and the Neon database, and can later sit under one domain (for
example `snip.app` and `api.snip.app`).

**Start on the free plan.** Its documented limit is 10 ms of CPU per request; waiting on
Gemini does not count. Measured in B1: 7–8 ms for a typical equation, 27 ms for a 1 MB
capture, and 78 ms for the first request after a deploy. Cloudflare enforces the limit
leniently (the website averages about 175 ms per request on the same plan without errors),
so stay on the free plan and move to Workers Paid ($5/month, 30 s per request) only if
Workers Logs show requests exceeding the CPU limit.

**URL:** `https://api.snip.rojinsharma.com`, set in `apps/api/wrangler.jsonc`. The
`workers.dev` URL is off, so there is one public address.

## 4. Access keys instead of accounts

Testers get an **access key**, like a software licence key: `snip_` followed by 26 random
base32 characters. The author creates keys with a script and sends them to waitlist users
by hand.

- **Why not email sign-in now:** it needs an email provider and a sending domain (the site
  is on `workers.dev`), plus a sign-in flow in the app, all before anyone has paid. A
  checkout in the launch phase collects the email address anyway.
- **Storage:** only the SHA-256 hash of a key is stored, with the tester's email (for
  contact), a monthly quota, and a revoked flag. A key is shown once, when it is created.
- **In the app:** pasted into Settings and stored in the macOS Keychain, not in
  `settings.json`. Sent as `Authorization: Bearer <key>`.
- **Admin:** `npm run keys:create -- --email a@b.c [--quota 200]`, `keys:revoke`,
  `keys:list` (usage this month per key).

## 5. Quotas, limits and the spending cap

Every recognition request writes one row to `snips`: key, time, status, engine, token
counts, cost, and latency. No image or LaTeX. The same table answers quota, rate-limit,
spending and usage questions.

| Check         | Rule                                                         | Response             |
| ------------- | ------------------------------------------------------------ | -------------------- |
| Key           | Exists and not revoked                                       | `401 invalid_key`    |
| Monthly quota | Successful snips this calendar month (UTC) < key's quota     | `429 quota_exceeded` |
| Rate limit    | At most 10 requests per key per minute                       | `429 rate_limited`   |
| Spending cap  | Today's total Gemini cost (UTC) < `DAILY_SPEND_CAP_USD` ($2) | `503 capacity`       |

Failed snips do not count toward the quota. Checks run before calling Gemini, so a
rejected request costs nothing. Two simultaneous requests can both pass the quota check;
going one or two snips over is acceptable at this scale.

**Database:** the existing Neon Postgres (the waitlist database), via its HTTP driver,
which works on Workers. Migrations move from `apps/web/db` to a top-level `db/` shared by
the website and the API.

**Latency risk:** Neon's free tier suspends after about 5 minutes idle, and waking it
adds a few hundred ms. If B2 measurements show that, the key check runs alongside the
Gemini call instead of before it, and the Gemini result is discarded for invalid keys.

## 6. API contract changes

```
POST /v1/recognize        Authorization: Bearer snip_…
  (existing responses, plus)
  401 { "error": "invalid_key",    "message": "That access key isn't valid." }
  429 { "error": "quota_exceeded", "message": "…", "resetsAt": "2026-12-01T00:00:00Z" }
  429 { "error": "rate_limited",   "message": "Too many snips. Wait a minute." }
  503 { "error": "capacity",       "message": "Snip is busy. Try again later." }

GET /v1/me                Authorization: Bearer snip_…
  200 { "quota": 200, "used": 37, "resetsAt": "2026-12-01T00:00:00Z" }
  401 invalid_key
```

## 7. Desktop app changes

- **API URL:** release builds use the production URL. `SNIP_API_URL` still overrides it
  for development.
- **Settings:** an **Access key** field (paste, verify with `GET /v1/me`, save to the
  Keychain) and a usage line: "37 of 200 snips this month".
- **Notifications** for the new errors. Without a key, a snip says "Add your access key in
  Settings" and opens the settings window.

## 8. Cost

| Item                        | Cost                                                |
| --------------------------- | --------------------------------------------------- |
| Cloudflare Workers Paid     | $5/month                                            |
| Apple Developer Program     | $99/year (needed for B4)                            |
| Neon                        | $0 (free tier)                                      |
| Gemini, per successful snip | About $0.0007 (≈1,200 input and ≈150 output tokens) |
| Gemini, one tester at quota | About $0.15/month (200 snips)                       |
| Gemini, worst case          | Capped at $2/day by the spending cap                |

## 9. Privacy

Images go to Gemini through our API and are not stored. LaTeX is not stored. The `snips`
table holds only metadata. The paid Gemini API tier does not use requests to train
models, which the landing page and the app's first-run text can say plainly.

## 10. Milestones

Each is one branch and one PR-sized change.

| #   | Milestone                                                                                | Proves                                |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| B1  | API on Workers (Express kept, same tests), deployed on push; one owner key from a secret | Hosting, latency, CPU time            |
| B2  | Access keys, `snips` table, quota, rate limit, spending cap, `GET /v1/me`, admin scripts | Costs are bounded per key and per day |
| B3  | App: key in the Keychain, Settings field and usage, new errors, production URL           | A tester can set up alone             |
| B4  | Developer ID signing and notarization; beta `.dmg`; QA on a second Mac                   | Installs like a real Mac app          |
| B5  | Invite 10 waitlist users; collect feedback; review cost and latency                      | People want it                        |

After B1, the author stops running `npm run dev:api`.

## 11. Risks

| Risk                                       | Likelihood    | Mitigation                                                   |
| ------------------------------------------ | ------------- | ------------------------------------------------------------ |
| A key is shared or leaked                  | Medium        | Quota per key, spending cap, `keys:revoke`                   |
| Workers CPU time per request is too high   | Low           | Measured in B1; Fly.io is the fallback with no code changes  |
| Neon wake-up adds latency                  | Medium        | Measured in B2; run the key check alongside Gemini           |
| Gemini outage or price change              | Low           | Engine is swappable; the spending cap bounds price surprises |
| Testers blocked by macOS security warnings | High until B4 | Developer ID signing and notarization in B4                  |

## 12. Decisions

| Question                | Decision                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Hosting                 | Cloudflare Workers, a separate `snip-api` Worker; free plan until CPU says otherwise |
| Beta authentication     | Access keys created with a script and sent to testers by hand                        |
| Quota per tester        | 200 successful snips per month                                                       |
| Daily spending cap      | $2 per day across all testers                                                        |
| Apple Developer Program | The author's existing organization account, used from B4                             |
| Custom domain           | Not needed for the beta; buy one before launch                                       |
