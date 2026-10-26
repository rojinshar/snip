import { describe, expect, it } from 'vitest';

import { summarize } from '../src/metrics.ts';
import { renderMarkdown, renderSummaryTable } from '../src/report.ts';
import { result } from './fixtures.ts';

const metadata = {
  startedAt: '2026-10-26T00:00:00.000Z',
  manifestPath: 'apps/bench/data/sample/manifest.jsonl',
  sampleCount: 2,
  engines: ['gemini-3.5-flash-lite', 'mathpix'],
};

describe('renderSummaryTable', () => {
  it('adds a Mathpix parity column with the 90% kill threshold', () => {
    const table = renderSummaryTable(
      summarize([
        result({ sampleId: 'a' }),
        result({ sampleId: 'b', exactMatch: false, renderMatch: false }),
        result({ engine: 'mathpix', sampleId: 'a' }),
        result({ engine: 'mathpix', sampleId: 'b' }),
      ]),
    );

    expect(table).toContain('vs Mathpix');
    expect(table).toMatch(/\| gemini-3.5-flash-lite \| 50\.0% .* \| 50\.0% FAIL \|/);
    expect(table).toMatch(/\| mathpix \| 100\.0% .* \| 100\.0% pass \|/);
  });

  it('omits the parity column when Mathpix was not run', () => {
    expect(renderSummaryTable(summarize([result()]))).not.toContain('vs Mathpix');
  });
});

describe('renderMarkdown', () => {
  it('lists misses with pipes escaped', () => {
    const rows = [result({ prediction: '|x|', exactMatch: false, renderMatch: false })];
    const markdown = renderMarkdown(metadata, rows, summarize(rows));

    expect(markdown).toContain('## Misses');
    expect(markdown).toContain('`\\|x\\|`');
  });

  it('says so when there are no misses', () => {
    const rows = [result()];
    expect(renderMarkdown(metadata, rows, summarize(rows))).toContain('None.');
  });
});
