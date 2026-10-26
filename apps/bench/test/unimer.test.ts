import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importUnimer } from '../src/importers/unimer.ts';

let root: string;
let sourceDir: string;
let outDir: string;

/** Writes a fake subset: `labels[i]` labels image i, and only `imageIndexes` have images. */
async function subset(name: string, labels: readonly string[], imageIndexes: readonly number[]) {
  await mkdir(path.join(sourceDir, name), { recursive: true });
  await writeFile(path.join(sourceDir, `${name}.txt`), labels.join('\n') + '\n');
  for (const i of imageIndexes) {
    await writeFile(path.join(sourceDir, name, `${String(i).padStart(7, '0')}.png`), '');
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'snip-unimer-'));
  sourceDir = path.join(root, 'raw', 'UniMER-Test');
  outDir = path.join(root, 'out');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('importUnimer', () => {
  it('labels image N with line N (0-based) and maps subsets to categories', async () => {
    await subset('hwe', ['a + b', 'x ^ { 2 }', 'c'], [1]);

    const { entries } = await importUnimer({
      sourceDir,
      outDir,
      subsets: ['hwe'],
      perSubset: 5,
      seed: 1,
    });

    expect(entries).toEqual([
      {
        id: 'hwe-0000001',
        image: path.join('..', 'raw', 'UniMER-Test', 'hwe', '0000001.png'),
        latex: 'x ^ { 2 }',
        category: 'handwritten',
        source: 'UniMER-Test/hwe/0000001.png',
      },
    ]);
  });

  it('skips missing and unrenderable labels and keeps sampling', async () => {
    await subset('spe', ['\\frac { a', '', 'y', 'z'], [0, 1, 2, 3, 9]);

    const { entries, reports } = await importUnimer({
      sourceDir,
      outDir,
      subsets: ['spe'],
      perSubset: 10,
      seed: 1,
    });

    expect(entries.map((e) => e.latex).sort()).toEqual(['y', 'z']);
    expect(reports).toEqual([{ subset: 'spe', available: 5, selected: 2, skipped: 3 }]);
  });

  it('samples reproducibly and caps at perSubset', async () => {
    const labels = Array.from({ length: 50 }, (_, i) => `x _ { ${i} }`);
    await subset(
      'cpe',
      labels,
      labels.map((_, i) => i),
    );
    const options = { sourceDir, outDir, subsets: ['cpe'] as const, perSubset: 5, seed: 42 };

    const first = await importUnimer(options);
    const second = await importUnimer(options);
    const otherSeed = await importUnimer({ ...options, seed: 43 });

    expect(first.entries).toHaveLength(5);
    expect(second.entries).toEqual(first.entries);
    expect(otherSeed.entries).not.toEqual(first.entries);
  });
});
