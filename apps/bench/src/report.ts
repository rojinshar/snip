import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type EngineSummary, isCorrect } from './metrics.ts';
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
    'Accuracy counts a prediction as correct when it renders to the same symbols and structure',
    'as the reference (fonts and layout wrappers ignored) or matches it exactly. Exact is the',
    'strict source-level check. Symbol dist is rendered-symbol edit distance (0 is perfect).',
    '',
    '## Accuracy by category',
    '',
    renderCategoryTable(summaries),
    '',
    '## Served by',
    '',
    ...summaries.map(
      (summary) =>
        `- ${summary.engine}: ` +
        Object.entries(summary.servedBy)
          .map(([by, share]) => `${by} ${pct(share)}`)
          .join(', '),
    ),
    '',
    '## Misses',
    '',
  ];

  const misses = results.filter((result) => !isCorrect(result));
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
    'Symbol dist',
    'p50 ms',
    'p95 ms',
    '$/snip',
    'Errors',
  ];
  if (mathpix) header.push('vs Mathpix');

  const rows = summaries.map((summary) => {
    const row = [
      summary.engine,
      pct(summary.accuracy),
      pct(summary.exactMatchRate),
      pct(summary.renderRate),
      summary.meanSymbolEditDistance.toFixed(3),
      Math.round(summary.latencyP50Ms).toString(),
      Math.round(summary.latencyP95Ms).toString(),
      summary.costPerSnipUsd.toFixed(5),
      summary.errors.toString(),
    ];
    if (mathpix) row.push(parity(summary.accuracy, mathpix.accuracy));
    return row;
  });

  return table(header, rows);
}

function renderCategoryTable(summaries: readonly EngineSummary[]): string {
  const categories = [...new Set(summaries.flatMap((summary) => Object.keys(summary.byCategory)))];
  const rows = summaries.map((summary) => [
    summary.engine,
    ...categories.map((category) => {
      const stats = summary.byCategory[category];
      return stats ? `${pct(stats.accuracy)} (n=${stats.samples})` : '-';
    }),
  ]);
  return table(['Engine', ...categories], rows);
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
