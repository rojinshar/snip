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

Put the Neon connection string in `apps/web/.env.local` as `DATABASE_URL` (git-ignored),
then apply migrations:

```sh
npm run db:migrate --workspace @snip/web
```

`db:migrate` applies `db/migrations/*.sql` in order, records them in `schema_migrations`,
and skips any that already ran, so it is safe to re-run. To read sign-ups:

```sql
SELECT email, source, created_at FROM waitlist_signups ORDER BY created_at DESC;
```

## Tracking where sign-ups come from

Add `?ref=<tag>` to links you post, e.g. `https://<site>/?ref=reddit-latex`. The tag is
stored in `waitlist_signups.source`. Use lowercase letters, digits and dashes.

## Deploy (Cloudflare)

Wrangler needs Node.js 22+ (the repo's `.nvmrc`). For local secrets used by `npm run preview`,
copy `DATABASE_URL` into `apps/web/.dev.vars` (git-ignored).

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
