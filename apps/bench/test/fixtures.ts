import type { Sample } from '../src/dataset.ts';
import type { SampleResult } from '../src/runner.ts';

export function sample(overrides: Partial<Sample> = {}): Sample {
  return {
    id: 's1',
    imagePath: '/dev/null',
    mimeType: 'image/png',
    latex: 'x^2',
    category: 'printed',
    ...overrides,
  };
}

export function result(overrides: Partial<SampleResult> = {}): SampleResult {
  return {
    engine: 'gemini-3.5-flash-lite',
    sampleId: 's1',
    category: 'printed',
    reference: 'x^2',
    prediction: 'x^2',
    renders: true,
    exactMatch: true,
    symbolMatch: true,
    tokenEditDistance: 0,
    symbolEditDistance: 0,
    latencyMs: 100,
    costUsd: 0.0001,
    ...overrides,
  };
}
