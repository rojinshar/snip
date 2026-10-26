import { describe, expect, it } from 'vitest';

import { percentile, summarize } from '../src/metrics.ts';
import { result } from './fixtures.ts';

describe('percentile', () => {
  it.each([
    [[], 50, 0],
    [[7], 95, 7],
    [[1, 2, 3, 4], 50, 2],
    [[5, 1, 4, 2, 3], 95, 5],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90, 9],
  ])('p%2$i of %1$j is %3$i', (values, p, expected) => {
    expect(percentile(values, p)).toBe(expected);
  });
});

describe('summarize', () => {
  it('aggregates per engine and per category', () => {
    const summaries = summarize([
      result({ sampleId: 'a', latencyMs: 100, costUsd: 0.001 }),
      result({
        sampleId: 'b',
        category: 'handwritten',
        exactMatch: false,
        renderMatch: false,
        renders: false,
        normalizedEditDistance: 0.5,
        latencyMs: 300,
        costUsd: 0.003,
        error: 'bad',
      }),
      result({ engine: 'mathpix', sampleId: 'a' }),
    ]);

    expect(summaries.map((s) => s.engine)).toEqual(['gemini-3.5-flash-lite', 'mathpix']);
    const lite = summaries[0];
    expect(lite).toMatchObject({
      samples: 2,
      exactMatchRate: 0.5,
      renderMatchRate: 0.5,
      renderRate: 0.5,
      meanEditDistance: 0.25,
      errors: 1,
      latencyP50Ms: 100,
      latencyP95Ms: 300,
    });
    expect(lite?.costPerSnipUsd).toBeCloseTo(0.002);
    expect(lite?.byCategory.printed?.exactMatchRate).toBe(1);
    expect(lite?.byCategory.handwritten?.exactMatchRate).toBe(0);
    expect(lite?.byCategory.multiline).toBeUndefined();
  });

  it('caps edit distance at 1 so one garbage output cannot dominate the mean', () => {
    const [summary] = summarize([result({ normalizedEditDistance: 5 })]);
    expect(summary?.meanEditDistance).toBe(1);
  });
});
