# packages/db

The Postgres schema (Neon) shared by the website and the API, and its migration runner.

| Table              | Used by | What                                                            |
| ------------------ | ------- | --------------------------------------------------------------- |
| `waitlist_signups` | web     | Landing-page sign-ups                                           |
| `access_keys`      | api     | Beta access keys: SHA-256 hash, tester email, quota, revocation |
| `snips`            | api     | One row per recognition: status, engine, tokens, cost, latency  |

```sh
npm run db:migrate   # from the repo root; reads DATABASE_URL from the root .env
```

Migrations in `migrations/` run in filename order, once each, recorded in
`schema_migrations`; each file runs in one transaction, so re-running is safe. Keep them to
plain DDL/DML: statements are split on semicolons at line ends.
