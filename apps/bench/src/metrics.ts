import { CATEGORIES, type Category } from './dataset.ts';
import type { EngineName } from './engines.ts';
import type { SampleResult } from './runner.ts';

export interface AccuracyStats {
  readonly samples: number;
  readonly exactMatchRate: number;
  readonly renderMatchRate: number;
  readonly renderRate: number;
  readonly meanEditDistance: number;
}

export interface EngineSummary extends AccuracyStats {
  readonly engine: EngineName;
  readonly errors: number;
  readonly latencyP50Ms: number;
  readonly latencyP95Ms: number;
  readonly totalCostUsd: number;
  readonly costPerSnipUsd: number;
  readonly byCategory: Partial<Record<Category, AccuracyStats>>;
}

export function summarize(results: readonly SampleResult[]): EngineSummary[] {
  const byEngine = groupBy(results, (result) => result.engine);

  return [...byEngine].map(([engine, rows]) => {
    const latencies = rows.map((row) => row.latencyMs);
    const totalCostUsd = sum(rows.map((row) => row.costUsd));
    const byCategory: Partial<Record<Category, AccuracyStats>> = {};
    for (const category of CATEGORIES) {
      const subset = rows.filter((row) => row.category === category);
      if (subset.length > 0) byCategory[category] = accuracy(subset);
    }

    return {
      engine,
      ...accuracy(rows),
      errors: rows.filter((row) => row.error !== undefined).length,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
      totalCostUsd,
      costPerSnipUsd: totalCostUsd / rows.length,
      byCategory,
    };
  });
}

function accuracy(rows: readonly SampleResult[]): AccuracyStats {
  return {
    samples: rows.length,
    exactMatchRate: rate(rows, (row) => row.exactMatch),
    renderMatchRate: rate(rows, (row) => row.renderMatch || row.exactMatch),
    renderRate: rate(rows, (row) => row.renders),
    meanEditDistance: sum(rows.map((row) => Math.min(row.normalizedEditDistance, 1))) / rows.length,
  };
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
