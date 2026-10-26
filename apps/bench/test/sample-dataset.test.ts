import path from 'node:path';

import { validateLatex } from '@snip/engine';
import { describe, expect, it } from 'vitest';

import { loadDataset } from '../src/dataset.ts';

const SAMPLE_MANIFEST = path.resolve(import.meta.dirname, '../data/sample/manifest.jsonl');

describe('committed sample dataset', () => {
  it('loads, and every reference renders with KaTeX', async () => {
    const samples = await loadDataset(SAMPLE_MANIFEST);

    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(validateLatex(sample.latex), sample.id).toEqual({ ok: true });
    }
  });
});
