import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { UsageError } from './cli-args.ts';
import { ENGINE_NAMES } from './engines.ts';
import { summarize } from './metrics.ts';
import { renderSummaryTable, writeReport } from './report.ts';
import { scoreSample } from './runner.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

const USAGE = `Usage: npm run bench:rescore -- <results-dir>

Re-scores a finished run with the current scorer, without calling any engine. Rewrites
predictions.jsonl, summary.json and summary.md in place. Relative paths resolve against
the repo root.`;

const storedResultSchema = z.object({
  engine: z.enum(ENGINE_NAMES),
  sampleId: z.string(),
  category: z.string(),
  reference: z.string(),
  prediction: z.string().nullable(),
  servedBy: z.string().optional(),
  error: z.string().optional(),
  latencyMs: z.number(),
  costUsd: z.number(),
});

const storedSummarySchema = z.object({
  startedAt: z.string(),
  manifestPath: z.string(),
  sampleCount: z.number(),
  engines: z.array(z.string()),
});

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: { help: { type: 'boolean', short: 'h', default: false } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const [dirArg] = positionals;
  if (dirArg === undefined || positionals.length > 1) {
    throw new UsageError('expected exactly one results directory');
  }

  const dir = path.resolve(REPO_ROOT, dirArg);
  const metadata = storedSummarySchema.parse(
    JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8')),
  );
  const lines = (await readFile(path.join(dir, 'predictions.jsonl'), 'utf8'))
    .split('\n')
    .filter((line) => line.trim() !== '');

  const results = lines.map((line) => {
    const row = storedResultSchema.parse(JSON.parse(line));
    return scoreSample(
      row.engine,
      { id: row.sampleId, latex: row.reference, category: row.category },
      {
        latex: row.prediction,
        costUsd: row.costUsd,
        ...(row.servedBy !== undefined ? { servedBy: row.servedBy } : {}),
        ...(row.error !== undefined ? { error: row.error } : {}),
      },
      row.latencyMs,
    );
  });

  const summaries = summarize(results);
  await writeReport(dir, metadata, results, summaries);
  console.log(`${renderSummaryTable(summaries)}\n`);
  console.log(`Rescored ${results.length} predictions in ${path.relative(process.cwd(), dir)}`);
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`error: ${error.message}\n\n${USAGE}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
