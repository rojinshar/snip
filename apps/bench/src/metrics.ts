import type { EngineName } from './engines.ts';
import type { SampleResult } from './runner.ts';

export interface AccuracyStats {
  readonly samples: number;
  /** Share counted correct: symbol match or exact match. The headline number. */
  readonly accuracy: number;
  readonly exactMatchRate: number;
  readonly renderRate: number;
  /** Means are capped at 1 per sample so one garbage output cannot dominate. */
  readonly meanSymbolEditDistance: number;
  readonly meanTokenEditDistance: number;
}

export interface EngineSummary extends AccuracyStats {
  readonly engine: EngineName;
  readonly errors: number;
  readonly latencyP50Ms: number;
  readonly latencyP95Ms: number;
  readonly totalCostUsd: number;
  readonly costPerSnipUsd: number;
  /** Share of samples answered by each underlying engine (differs from `engine` for routers). */
  readonly servedBy: Readonly<Record<string, number>>;
  /** Keyed by category, in order of first appearance in the dataset. */
  readonly byCategory: Readonly<Record<string, AccuracyStats>>;
}

export function summarize(results: readonly SampleResult[]): EngineSummary[] {
  const byEngine = groupBy(results, (result) => result.engine);

  return [...byEngine].map(([engine, rows]) => {
    const latencies = rows.map((row) => row.latencyMs);
    const totalCostUsd = sum(rows.map((row) => row.costUsd));
    const byCategory = Object.fromEntries(
      [...groupBy(rows, (row) => row.category)].map(([category, subset]) => [
        category,
        accuracy(subset),
      ]),
    );

    return {
      engine,
      ...accuracy(rows),
      errors: rows.filter((row) => row.error !== undefined).length,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
      totalCostUsd,
      costPerSnipUsd: totalCostUsd / rows.length,
      servedBy: Object.fromEntries(
        [...groupBy(rows, (row) => row.servedBy ?? 'none')].map(([by, group]) => [
          by,
          group.length / rows.length,
        ]),
      ),
      byCategory,
    };
  });
}

function accuracy(rows: readonly SampleResult[]): AccuracyStats {
  return {
    samples: rows.length,
    accuracy: rate(rows, isCorrect),
    exactMatchRate: rate(rows, (row) => row.exactMatch),
    renderRate: rate(rows, (row) => row.renders),
    meanSymbolEditDistance: cappedMean(rows.map((row) => row.symbolEditDistance)),
    meanTokenEditDistance: cappedMean(rows.map((row) => row.tokenEditDistance)),
  };
}

export function isCorrect(result: SampleResult): boolean {
  return result.symbolMatch || result.exactMatch;
}

function cappedMean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values.map((v) => Math.min(v, 1))) / values.length;
}

/** Nearest-rank percentile. Returns 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? 0;
}

function rate<T>(rows: readonly T[], predicate: (row: T) => boolean): number {
  return rows.length === 0 ? 0 : rows.filter(predicate).length / rows.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
