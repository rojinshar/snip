import { describe, expect, it } from 'vitest';

import type { BenchRunner, RunOutput } from '../src/engines.ts';
import { runBenchmark, scoreSample } from '../src/runner.ts';
import { sample } from './fixtures.ts';

describe('scoreSample', () => {
  it('scores a correct prediction', () => {
    const scored = scoreSample(
      'gemini-flash',
      sample({ latex: '\\frac{a}{b}' }),
      { latex: '\\dfrac{a}{b}', costUsd: 0.001, servedBy: 'gemini-flash' },
      250,
    );

    expect(scored).toMatchObject({
      engine: 'gemini-flash',
      servedBy: 'gemini-flash',
      renders: true,
      exactMatch: true,
      latencyMs: 250,
      costUsd: 0.001,
    });
    expect(scored).not.toHaveProperty('error');
  });

  it('scores an engine failure as a full miss', () => {
    const scored = scoreSample('mathpix', sample(), { latex: null, costUsd: 0, error: 'boom' }, 5);

    expect(scored).toMatchObject({
      prediction: null,
      error: 'boom',
      renders: false,
      exactMatch: false,
      renderMatch: false,
      normalizedEditDistance: 1,
    });
  });
});

describe('runBenchmark', () => {
  it('runs every sample through every runner', async () => {
    const fixed =
      (name: BenchRunner['name'], latex: string): BenchRunner['run'] =>
      () =>
        Promise.resolve<RunOutput>({ latex, costUsd: 0, servedBy: name });
    const runners: BenchRunner[] = [
      { name: 'gemini-flash-lite', run: fixed('gemini-flash-lite', 'x^2') },
      { name: 'gemini-flash', run: fixed('gemini-flash', 'y') },
    ];
    const seen: string[] = [];

    const results = await runBenchmark({
      samples: [sample({ id: 'a' }), sample({ id: 'b' })],
      runners,
      concurrency: 2,
      onResult: (r) => seen.push(`${r.engine}/${r.sampleId}`),
    });

    expect(results.map((r) => [r.engine, r.sampleId, r.exactMatch])).toEqual([
      ['gemini-flash-lite', 'a', true],
      ['gemini-flash-lite', 'b', true],
      ['gemini-flash', 'a', false],
      ['gemini-flash', 'b', false],
    ]);
    expect(seen).toHaveLength(4);
  });
});
