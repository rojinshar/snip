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

Create a free Neon project, copy its connection string into `DATABASE_URL`, then apply the
migration once:

```sh
psql "$DATABASE_URL" -f apps/web/db/migrations/0001_create_waitlist_signups.sql
```

You can also paste the file into Neon's SQL editor. To read sign-ups:

```sql
SELECT email, source, created_at FROM waitlist_signups ORDER BY created_at DESC;
```

## Tracking where sign-ups come from

Add `?ref=<tag>` to links you post, e.g. `https://<site>/?ref=reddit-latex`. The tag is
stored in `waitlist_signups.source`. Use lowercase letters, digits and dashes.

## Deploy (Cloudflare)

Wrangler needs Node.js 22+.

```sh
cd apps/web
npx wrangler login
npx wrangler secret put DATABASE_URL     # paste the Neon connection string
npm run deploy                           # opennextjs-cloudflare build + deploy
```

`npm run preview` runs the production build locally on the Workers runtime.

## Code layout

| Path                                  | What                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `src/app/page.tsx`                    | Landing page                                           |
| `src/components/waitlist-form.tsx`    | Client-side form (honeypot, `?ref=` capture)           |
| `src/app/api/waitlist/route.ts`       | `POST /api/waitlist`, a thin wrapper                   |
| `src/lib/waitlist.ts`                 | Validation and handling, tested with a fake repository |
| `src/lib/neon-waitlist-repository.ts` | Postgres insert (idempotent on email)                  |
| `db/migrations/`                      | SQL migrations                                         |
