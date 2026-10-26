import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatasetError, loadDataset } from '../src/dataset.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'snip-dataset-'));
  await writeFile(path.join(dir, 'a.png'), '');
  await writeFile(path.join(dir, 'b.JPG'), '');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function manifest(lines: readonly string[]): Promise<string> {
  const file = path.join(dir, 'manifest.jsonl');
  await writeFile(file, lines.join('\n'));
  return file;
}

const entry = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ id: 'a', image: 'a.png', latex: 'x^2', category: 'printed', ...overrides });

describe('loadDataset', () => {
  it('loads entries and resolves images relative to the manifest', async () => {
    const file = await manifest([
      '// comment',
      entry(),
      '',
      entry({ id: 'b', image: 'b.JPG', category: 'handwritten' }),
    ]);

    const samples = await loadDataset(file);

    expect(samples).toEqual([
      {
        id: 'a',
        imagePath: path.join(dir, 'a.png'),
        mimeType: 'image/png',
        latex: 'x^2',
        category: 'printed',
      },
      {
        id: 'b',
        imagePath: path.join(dir, 'b.JPG'),
        mimeType: 'image/jpeg',
        latex: 'x^2',
        category: 'handwritten',
      },
    ]);
  });

  it('reports every problem with its line number', async () => {
    const file = await manifest([
      entry(),
      entry(),
      '{not json',
      entry({ id: 'c', image: 'missing.png' }),
      entry({ id: 'd', image: 'a.gif' }),
      entry({ id: 'e', category: 'typed' }),
    ]);

    const error = await loadDataset(file).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DatasetError);
    const message = (error as DatasetError).message;
    expect(message).toContain(':2: duplicate id "a"');
    expect(message).toContain(':3: invalid JSON');
    expect(message).toContain(':4: image not found');
    expect(message).toContain(':5: unsupported image type');
    expect(message).toContain(':6:');
  });

  it('rejects an empty manifest', async () => {
    await expect(loadDataset(await manifest(['// nothing']))).rejects.toThrow('has no entries');
  });

  it('rejects a missing manifest', async () => {
    await expect(loadDataset(path.join(dir, 'nope.jsonl'))).rejects.toThrow(DatasetError);
  });
});
