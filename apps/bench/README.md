# @snip/bench

Measures accuracy, latency and cost of each OCR engine against a labelled set of equation
images. This is the Week 1 "accuracy bake-off" from the opportunity analysis. Its output
decides the default model and checks the kill criterion: stop if accuracy is below 90% of
Mathpix's.

## Run

From the repository root:

```sh
cp .env.example .env            # add GEMINI_API_KEY (and Mathpix keys if you have them)
npm run bench                   # sample set, Gemini engines and router
npm run bench -- --dataset data/my-set/manifest.jsonl --engines gemini-flash-lite,router,mathpix
npm run bench -- --help
```

Each run writes to `apps/bench/results/<timestamp>/`:

- `summary.md`: overall table, accuracy by category, and every miss with its prediction
- `summary.json`: the same numbers, machine-readable
- `predictions.jsonl`: one row per engine and sample, for your own analysis

## Engines

| Name                | What it is                                                                     |
| ------------------- | ------------------------------------------------------------------------------ |
| `gemini-flash-lite` | Gemini 2.5 Flash-Lite, the planned default                                     |
| `gemini-flash`      | Gemini 2.5 Flash, the planned retry model                                      |
| `router`            | Production routing: Flash-Lite, then Flash if the output fails the KaTeX check |
| `mathpix`           | Mathpix Convert API, the reference to beat                                     |

## Metrics

- **Accuracy:** the prediction matches the reference after normalization, or both render to
  identical MathML. This is the headline number.
- **Exact:** normalized token sequences are identical. Stricter, source-level.
- **Renders:** the share of outputs that KaTeX can parse. Anything else never reaches a user.
- **Edit dist:** token-level Levenshtein distance divided by reference length, capped at 1.
  Lower is better, and it shows how close the misses are.
- **p50 / p95 ms:** wall-clock time per request, including retries.
- **$/snip:** computed from reported token usage and list prices in `@snip/engine`.

Latency is measured under `--concurrency` parallel requests. To get numbers closer to what a
single user sees, run with `--concurrency 1`.
