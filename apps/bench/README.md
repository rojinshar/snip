# @snip/bench

Measures accuracy, latency and cost of each OCR engine against a labelled set of equation
images. This is the Week 1 "accuracy bake-off" from the opportunity analysis. Its output
decides the default model and checks the kill criterion: stop if accuracy is below 90% of
Mathpix's.

## Run

From the repository root:

```sh
cp .env.example .env            # add GEMINI_API_KEY (and Mathpix keys if you have them)
npm run bench                   # sample set, all Gemini engines and the router
npm run bench -- --dataset data/my-set/manifest.jsonl --engines gemini-3.5-flash-lite,router,mathpix
npm run bench -- --help
```

Each run writes to `results/<timestamp>/` at the repository root (git-ignored):

- `summary.md`: overall table, accuracy by category, and every miss with its prediction
- `summary.json`: the same numbers, machine-readable
- `predictions.jsonl`: one row per engine and sample, for your own analysis

## Engines

| Name                    | What it is                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `gemini-3.5-flash-lite` | Planned default; Google's recommended high-volume model                                |
| `gemini-3.1-flash-lite` | Cheaper previous generation; candidate default if accuracy holds up                    |
| `gemini-3.8-flash`      | Strongest Flash model; planned retry                                                   |
| `router`                | Production routing: 3.5 Flash-Lite, then 3.8 Flash if the output fails the KaTeX check |
| `mathpix`               | Mathpix Convert API, the reference to beat                                             |

Model IDs, prices and thinking levels live in `GEMINI_PRESETS` in
`packages/engine/src/engines/gemini.ts`.

## Metrics

- **Accuracy:** the prediction renders to the same visible symbols and structure as the
  reference (scripts, fractions, roots, tables), ignoring fonts and layout wrappers, so
  `\\begin{array}` vs `\\begin{aligned}` or `\\mathrm{m}` vs `\\text{m}` still count as correct. This
  is the headline number. Because fonts are ignored, `\\mathfrak{g}` vs `g` also passes.
- **Exact:** normalized token sequences are identical. Stricter, source-level.
- **Renders:** the share of outputs that KaTeX can parse. Anything else never reaches a user.
- **Symbol dist:** edit distance over rendered symbols divided by reference length, capped
  at 1. Lower is better, and it shows how close the misses are. A LaTeX-token version is in
  `summary.json` as `meanTokenEditDistance`.
- **p50 / p95 ms:** wall-clock time per request, including retries.
- **$/snip:** computed from reported token usage and list prices in `@snip/engine`.

Latency is measured under `--concurrency` parallel requests. To get numbers closer to what a
single user sees, run with `--concurrency 1`.
