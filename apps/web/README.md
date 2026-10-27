# apps/web

Snip's website: the landing page and waitlist. Built with Next.js (App Router) and
Tailwind CSS, and deployed to Cloudflare Workers with the
[OpenNext adapter](https://opennext.js.org/cloudflare). Sign-ups go to Neon Postgres.

## Local development

```sh
cp apps/web/.env.example apps/web/.env.local   # add DATABASE_URL (optional for UI work)
npm run dev:web                                # http://localhost:3100
```

Without `DATABASE_URL` the page works, but the form returns "Sign-ups are temporarily
unavailable."

## Database

Put the Neon connection string in `apps/web/.env.local` as `DATABASE_URL` (git-ignored).
The schema is shared with the API and lives in [`packages/db`](../../packages/db); apply it
from the repo root with `npm run db:migrate` (reads `DATABASE_URL` from the root `.env`).
To read sign-ups:

```sql
SELECT email, source, created_at FROM waitlist_signups ORDER BY created_at DESC;
```

## Tracking where sign-ups come from

Add `?ref=<tag>` to links you post, e.g. `https://<site>/?ref=reddit-latex`. The tag is
stored in `waitlist_signups.source`. Use lowercase letters, digits and dashes.

## Deploy (Cloudflare)

**Automatic:** every push to `main` is built and deployed by Cloudflare Workers Builds
(Cloudflare dashboard, Workers & Pages, `snip-web`, Settings, Build). It is configured as:

| Setting        | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| Root directory | `/` (the repo root, so dependencies install from the root lockfile) |
| Build command  | `cd apps/web && npx opennextjs-cloudflare build`                    |
| Deploy command | `cd apps/web && npx opennextjs-cloudflare deploy`                   |
| Build variable | `NODE_VERSION=22`                                                   |
| Preview builds | off (they would share the production database)                      |

Runtime secrets live on the Worker (`npx wrangler secret put DATABASE_URL`) and are kept
across deploys.

**Manual** (Node 22+, the repo's `.nvmrc`):

```sh
cd apps/web
npx wrangler login
npm run deploy           # opennextjs-cloudflare build + deploy
```

`npm run preview` runs the production build locally on the Workers runtime. It reads local
secrets from `apps/web/.dev.vars` (git-ignored).

## Code layout

| Path                                  | What                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `src/app/page.tsx`                    | Landing page                                           |
| `src/components/waitlist-form.tsx`    | Client-side form (honeypot, `?ref=` capture)           |
| `src/app/api/waitlist/route.ts`       | `POST /api/waitlist`, a thin wrapper                   |
| `src/lib/waitlist.ts`                 | Validation and handling, tested with a fake repository |
| `src/lib/neon-waitlist-repository.ts` | Postgres insert (idempotent on email)                  |
