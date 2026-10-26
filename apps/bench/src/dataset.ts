import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ImageMimeType, OcrImage } from '@snip/engine';
import { z } from 'zod';

/** Lowercase slug, e.g. `printed` or `handwritten`. Each dataset defines its own set. */
const CATEGORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MIME_BY_EXTENSION: Readonly<Record<string, ImageMimeType>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const manifestEntrySchema = z.object({
  id: z.string().min(1),
  /** Path to the image, relative to the manifest file. */
  image: z.string().min(1),
  /** Ground-truth LaTeX, without math delimiters. */
  latex: z.string().min(1),
  category: z.string().regex(CATEGORY_PATTERN, 'must be a lowercase slug, e.g. "handwritten"'),
  /** Free-text provenance, e.g. "Griffiths QM 2.3". */
  source: z.string().optional(),
});

export type ManifestEntry = z.input<typeof manifestEntrySchema>;

export interface Sample {
  readonly id: string;
  readonly imagePath: string;
  readonly mimeType: ImageMimeType;
  readonly latex: string;
  readonly category: string;
}

export class DatasetError extends Error {
  override readonly name = 'DatasetError';
}

/**
 * Reads a JSONL manifest (one entry per line, blank lines and `//` comments allowed) and
 * checks that every id is unique and every image exists with a supported extension.
 */
export async function loadDataset(manifestPath: string): Promise<Sample[]> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    throw new DatasetError(`Cannot read manifest ${manifestPath}`, { cause: error });
  }

  const baseDir = path.dirname(manifestPath);
  const samples: Sample[] = [];
  const seenIds = new Set<string>();
  const problems: string[] = [];

  for (const [index, line] of raw.split('\n').entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    const where = `${manifestPath}:${index + 1}`;

    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      problems.push(`${where}: invalid JSON`);
      continue;
    }

    const parsed = manifestEntrySchema.safeParse(json);
    if (!parsed.success) {
      problems.push(`${where}: ${z.prettifyError(parsed.error).replaceAll('\n', ' ')}`);
      continue;
    }

    const entry = parsed.data;
    if (seenIds.has(entry.id)) {
      problems.push(`${where}: duplicate id "${entry.id}"`);
      continue;
    }
    seenIds.add(entry.id);

    const mimeType = MIME_BY_EXTENSION[path.extname(entry.image).toLowerCase()];
    if (mimeType === undefined) {
      problems.push(`${where}: unsupported image type "${entry.image}"`);
      continue;
    }

    const imagePath = path.resolve(baseDir, entry.image);
    try {
      await access(imagePath);
    } catch {
      problems.push(`${where}: image not found at ${imagePath}`);
      continue;
    }

    samples.push({
      id: entry.id,
      imagePath,
      mimeType,
      latex: entry.latex,
      category: entry.category,
    });
  }

  if (problems.length > 0) {
    throw new DatasetError(`Invalid manifest:\n  ${problems.join('\n  ')}`);
  }
  if (samples.length === 0) throw new DatasetError(`Manifest ${manifestPath} has no entries`);
  return samples;
}

export async function readSampleImage(sample: Sample): Promise<OcrImage> {
  return { data: await readFile(sample.imagePath), mimeType: sample.mimeType };
}
