# apps/api (planned)

Express + TypeScript backend.

- Auth and sessions for the web and desktop apps
- Snip endpoint: receives an image, runs `@snip/engine`'s router, returns validated LaTeX
- Per-user snip quotas (free tier: 200/month), usage counts in Postgres
- Stripe subscriptions and webhooks
