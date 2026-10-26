import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CATEGORIES } from './dataset.ts';
import type { EngineSummary } from './metrics.ts';
import type { SampleResult } from './runner.ts';

export interface RunMetadata {
  readonly startedAt: string;
  readonly manifestPath: string;
  readonly sampleCount: number;
  readonly engines: readonly string[];
}

/** The kill criterion from the opportunity analysis: stop below 90% of Mathpix accuracy. */
export const MATHPIX_PARITY_THRESHOLD = 0.9;

/**
 * Writes predictions.jsonl (one row per engine and sample), summary.json and summary.md
 * into `outDir`.
 */
export async function writeReport(
  outDir: string,
  metadata: RunMetadata,
  results: readonly SampleResult[],
  summaries: readonly EngineSummary[],
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(outDir, 'predictions.jsonl'),
      results.map((result) => JSON.stringify(result)).join('\n') + '\n',
    ),
    writeFile(
      path.join(outDir, 'summary.json'),
      JSON.stringify({ ...metadata, summaries }, null, 2) + '\n',
    ),
    writeFile(path.join(outDir, 'summary.md'), renderMarkdown(metadata, results, summaries)),
  ]);
}

export function renderMarkdown(
  metadata: RunMetadata,
  results: readonly SampleResult[],
  summaries: readonly EngineSummary[],
): string {
  const lines = [
    '# Snip OCR benchmark',
    '',
    `- Run: ${metadata.startedAt}`,
    `- Dataset: \`${metadata.manifestPath}\` (${metadata.sampleCount} samples)`,
    '',
    '## Overall',
    '',
    renderSummaryTable(summaries),
    '',
    'Accuracy counts a prediction as correct when it matches the reference after normalization',
    'or renders to identical MathML. Exact match is the stricter, source-level check.',
    '',
    '## Accuracy by category',
    '',
    renderCategoryTable(summaries),
    '',
    '## Misses',
    '',
  ];

  const misses = results.filter((result) => !result.exactMatch && !result.renderMatch);
  if (misses.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Engine | Sample | Category | Reference | Prediction | Error |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const miss of misses) {
      lines.push(
        `| ${miss.engine} | ${miss.sampleId} | ${miss.category} | ${code(miss.reference)} | ` +
          `${miss.prediction === null ? '' : code(miss.prediction)} | ${cell(miss.error ?? '')} |`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

export function renderSummaryTable(summaries: readonly EngineSummary[]): string {
  const mathpix = summaries.find((summary) => summary.engine === 'mathpix');
  const header = [
    'Engine',
    'Accuracy',
    'Exact',
    'Renders',
    'Edit dist',
    'p50 ms',
    'p95 ms',
    '$/snip',
    'Errors',
  ];
  if (mathpix) header.push('vs Mathpix');

  const rows = summaries.map((summary) => {
    const row = [
      summary.engine,
      pct(summary.renderMatchRate),
      pct(summary.exactMatchRate),
      pct(summary.renderRate),
      summary.meanEditDistance.toFixed(3),
      Math.round(summary.latencyP50Ms).toString(),
      Math.round(summary.latencyP95Ms).toString(),
      summary.costPerSnipUsd.toFixed(5),
      summary.errors.toString(),
    ];
    if (mathpix) row.push(parity(summary.renderMatchRate, mathpix.renderMatchRate));
    return row;
  });

  return table(header, rows);
}

function renderCategoryTable(summaries: readonly EngineSummary[]): string {
  const rows = summaries.map((summary) => [
    summary.engine,
    ...CATEGORIES.map((category) => {
      const stats = summary.byCategory[category];
      return stats ? `${pct(stats.renderMatchRate)} (n=${stats.samples})` : '-';
    }),
  ]);
  return table(['Engine', ...CATEGORIES], rows);
}

function parity(rate: number, reference: number): string {
  if (reference === 0) return '-';
  const ratio = rate / reference;
  return `${pct(ratio)} ${ratio >= MATHPIX_PARITY_THRESHOLD ? 'pass' : 'FAIL'}`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function code(text: string): string {
  return `\`${cell(text).replaceAll('`', "'")}\``;
}
