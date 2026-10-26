import path from 'node:path';
import { parseArgs } from 'node:util';

import { UsageError, positiveInt } from './cli-args.ts';
import { DatasetError, loadDataset } from './dataset.ts';
import type { ConfidenceGate } from '@snip/engine';

import {
  DEFAULT_HYBRID_GATE,
  ENGINE_NAMES,
  EngineConfigError,
  createRunners,
  isEngineName,
} from './engines.ts';
import { loadEnv } from './env.ts';
import { isCorrect, summarize } from './metrics.ts';
import { renderSummaryTable, writeReport } from './report.ts';
import { runBenchmark } from './runner.ts';

const BENCH_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(BENCH_ROOT, '../..');

const DEFAULT_ENGINES = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash,router';

const USAGE = `Usage: npm run bench -- [options]

Options:
  --dataset <path>      JSONL manifest (default: data/sample/manifest.jsonl)
  --engines <list>      Comma-separated: ${ENGINE_NAMES.join(', ')}
                        (default: ${DEFAULT_ENGINES})
  --concurrency <n>     Max in-flight requests (default: 4)
  --limit <n>           Only run the first n samples
  --rpm <n>             Max Gemini requests started per minute, per model (free tier: 15)
  --gate <metric:value> Hybrid router: accept UniMERNet when its confidence metric
                        (mean or min) is at least value
                        (default: ${DEFAULT_HYBRID_GATE.metric}:${DEFAULT_HYBRID_GATE.threshold})
  --out <dir>           Output directory (default: <repo>/results/<timestamp>)
  -h, --help            Show this help

--dataset resolves against apps/bench; --out against the repo root.`;

interface CliOptions {
  readonly manifestPath: string;
  readonly engines: (typeof ENGINE_NAMES)[number][];
  readonly concurrency: number;
  readonly limit: number | undefined;
  readonly rpm: number | undefined;
  readonly gate: ConfidenceGate;
  readonly outDir: string;
}

const CLI_OPTIONS = {
  dataset: { type: 'string', default: 'data/sample/manifest.jsonl' },
  engines: { type: 'string', default: DEFAULT_ENGINES },
  concurrency: { type: 'string', default: '4' },
  limit: { type: 'string' },
  rpm: { type: 'string' },
  gate: { type: 'string' },
  out: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
} as const;

function parseCli(argv: string[], startedAt: Date): CliOptions | null {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: CLI_OPTIONS, strict: true }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  if (values.help) return null;

  const engines = values.engines.split(',').map((name) => name.trim());
  const unknown = engines.filter((name) => !isEngineName(name));
  if (unknown.length > 0) throw new UsageError(`Unknown engine(s): ${unknown.join(', ')}`);

  const stamp = startedAt
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  return {
    manifestPath: path.resolve(BENCH_ROOT, values.dataset),
    engines: engines.filter(isEngineName),
    concurrency: positiveInt('--concurrency', values.concurrency),
    limit: values.limit === undefined ? undefined : positiveInt('--limit', values.limit),
    rpm: values.rpm === undefined ? undefined : positiveInt('--rpm', values.rpm),
    gate: values.gate === undefined ? DEFAULT_HYBRID_GATE : parseGate(values.gate),
    outDir: path.resolve(REPO_ROOT, values.out ?? path.join('results', stamp)),
  };
}

function parseGate(raw: string): ConfidenceGate {
  const [metric, value] = raw.split(':');
  const threshold = Number(value);
  if ((metric !== 'mean' && metric !== 'min') || !(threshold > 0 && threshold <= 1)) {
    throw new UsageError('--gate must look like mean:0.98 or min:0.5');
  }
  return { metric, threshold };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const options = parseCli(process.argv.slice(2), startedAt);
  if (options === null) {
    console.log(USAGE);
    return;
  }

  const env = loadEnv(path.join(REPO_ROOT, '.env'));
  const runners = createRunners(options.engines, env, {
    hybridGate: options.gate,
    ...(options.rpm === undefined ? {} : { geminiRpm: options.rpm }),
  });
  const allSamples = await loadDataset(options.manifestPath);
  const samples = options.limit === undefined ? allSamples : allSamples.slice(0, options.limit);

  const total = samples.length * runners.length;
  let done = 0;
  console.error(
    `Running ${samples.length} samples x ${runners.length} engines (${options.engines.join(', ')})`,
  );

  const results = await runBenchmark({
    samples,
    runners,
    concurrency: options.concurrency,
    onResult: (result) => {
      done++;
      const mark = isCorrect(result) ? 'ok  ' : 'miss';
      const error = result.error === undefined ? '' : ` (${result.error.slice(0, 200)})`;
      console.error(`[${done}/${total}] ${mark} ${result.engine} ${result.sampleId}${error}`);
    },
  });

  const summaries = summarize(results);
  await writeReport(
    options.outDir,
    {
      startedAt: startedAt.toISOString(),
      manifestPath: path.relative(REPO_ROOT, options.manifestPath),
      sampleCount: samples.length,
      engines: options.engines,
    },
    results,
    summaries,
  );

  console.log(`\n${renderSummaryTable(summaries)}\n`);
  console.log(`Full report: ${path.relative(process.cwd(), options.outDir)}/summary.md`);
}

main().catch((error: unknown) => {
  if (
    error instanceof UsageError ||
    error instanceof DatasetError ||
    error instanceof EngineConfigError
  ) {
    console.error(`error: ${error.message}`);
    if (error instanceof UsageError) console.error(`\n${USAGE}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
