# Snip

Screenshot any equation, paste LaTeX.

Snip is a hotkey tool: drag a box over an equation anywhere on screen, and paste-ready LaTeX
lands on your clipboard. Every result is checked with KaTeX before you see it.

## Repository layout

`apps/` holds deployable or runnable programs; `packages/` holds libraries they share.

```
apps/
  bench/    accuracy, latency and cost benchmark for the engines
  web/      Next.js landing page + waitlist (Cloudflare, Neon); later sign-in and billing
  api/      (planned) Express: auth, snip quotas, Stripe, serves OCR via the engine
  desktop/  Tauri macOS menu-bar app (M1: hotkey + region capture)
  unimernet-server/  Python: self-hosted UniMERNet model served over HTTP
packages/
  engine/   OCR engines (Gemini, Mathpix), model router, LaTeX validation and scoring
```

## Design docs

- [Desktop app v0](docs/desktop-v0.md)

## Requirements

- Node.js 22+ (`nvm use`; Cloudflare's wrangler requires 22)
- npm 10+

## Getting started

```sh
npm install
cp .env.example .env    # add your keys
npm run check           # typecheck, lint, format check, tests
npm run bench           # run the OCR benchmark on the sample set
```

## Scripts

| Script                 | What it does                      |
| ---------------------- | --------------------------------- |
| `npm run typecheck`    | `tsc -b` across all workspaces    |
| `npm run lint`         | ESLint (typescript-eslint strict) |
| `npm run format`       | Prettier write                    |
| `npm test`             | Vitest, run once                  |
| `npm run check`        | Everything CI runs                |
| `npm run bench -- ...` | OCR benchmark; see `apps/bench`   |

## Conventions

- TypeScript strict mode, ESM, and Node built-ins over dependencies where reasonable.
- Workspace packages are consumed as TypeScript source (`exports` points at `src/index.ts`).
  Apps run through `tsx`, so there is no build step for internal packages yet.
- Unit tests sit next to each package in `test/`. Tests never call paid APIs.
- Conventional Commits (`feat:`, `fix:`, `chore:` ...), with feature branches merged into
  `main`.
