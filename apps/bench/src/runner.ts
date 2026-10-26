import { compareLatex, validateLatex } from '@snip/engine';
import pLimit from 'p-limit';

import { type Sample, readSampleImage } from './dataset.ts';
import type { BenchRunner, EngineName } from './engines.ts';
import type { RateLimiter } from './rate-limit.ts';

export interface SampleResult {
  readonly engine: EngineName;
  readonly sampleId: string;
  readonly category: Sample['category'];
  readonly reference: string;
  readonly prediction: string | null;
  readonly servedBy?: string;
  readonly error?: string;
  readonly renders: boolean;
  readonly exactMatch: boolean;
  readonly renderMatch: boolean;
  readonly normalizedEditDistance: number;
  readonly latencyMs: number;
  readonly costUsd: number;
}

export interface RunBenchmarkOptions {
  readonly samples: readonly Sample[];
  readonly runners: readonly BenchRunner[];
  /** Maximum in-flight requests across all engines. */
  readonly concurrency: number;
  /** Optional throttle shared by all runners, for provider requests-per-minute quotas. */
  readonly rateLimiter?: RateLimiter;
  readonly onResult?: (result: SampleResult) => void;
  readonly now?: () => number;
}

/** Runs every sample through every runner and scores each prediction against ground truth. */
export async function runBenchmark(options: RunBenchmarkOptions): Promise<SampleResult[]> {
  const { samples, runners, onResult } = options;
  const now = options.now ?? (() => performance.now());
  const limit = pLimit(options.concurrency);

  const tasks = runners.flatMap((runner) =>
    samples.map((sample) =>
      limit(async () => {
        const image = await readSampleImage(sample);
        await options.rateLimiter?.acquire();
        const startedAt = now();
        const output = await runner.run(image);
        const result = scoreSample(runner.name, sample, output, now() - startedAt);
        onResult?.(result);
        return result;
      }),
    ),
  );

  return Promise.all(tasks);
}

export function scoreSample(
  engine: EngineName,
  sample: Sample,
  output: Awaited<ReturnType<BenchRunner['run']>>,
  latencyMs: number,
): SampleResult {
  const prediction = output.latex;
  const comparison =
    prediction === null
      ? { exactMatch: false, renderMatch: false, normalizedEditDistance: 1 }
      : compareLatex(prediction, sample.latex);

  return {
    engine,
    sampleId: sample.id,
    category: sample.category,
    reference: sample.latex,
    prediction,
    ...(output.servedBy !== undefined ? { servedBy: output.servedBy } : {}),
    ...(output.error !== undefined ? { error: output.error } : {}),
    renders: prediction !== null && validateLatex(prediction).ok,
    ...comparison,
    latencyMs,
    costUsd: output.costUsd,
  };
}
