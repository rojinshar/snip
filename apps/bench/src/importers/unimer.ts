import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateLatex } from '@snip/engine';

import type { ManifestEntry } from '../dataset.ts';
import { createRng, shuffled } from '../random.ts';

/**
 * UniMER-Test subsets (https://huggingface.co/datasets/wanderkid/UniMER_Dataset, Apache-2.0)
 * mapped to the category names used in our manifests.
 */
export const UNIMER_SUBSETS = {
  spe: 'simple-printed',
  cpe: 'complex-printed',
  sce: 'screen-capture',
  hwe: 'handwritten',
} as const;

export type UnimerSubset = keyof typeof UNIMER_SUBSETS;

export function isUnimerSubset(value: string): value is UnimerSubset {
  return Object.hasOwn(UNIMER_SUBSETS, value);
}

export interface UnimerImportOptions {
  /** Extracted `UniMER-Test/` directory containing `<subset>/` image folders and `<subset>.txt`. */
  readonly sourceDir: string;
  /** Directory the manifest is written to; image paths are made relative to it. */
  readonly outDir: string;
  readonly subsets: readonly UnimerSubset[];
  readonly perSubset: number;
  readonly seed: number;
}

export interface SubsetReport {
  readonly subset: UnimerSubset;
  readonly available: number;
  readonly selected: number;
  /** Images whose label is missing or does not render in KaTeX, skipped while sampling. */
  readonly skipped: number;
}

export interface UnimerImport {
  readonly entries: readonly ManifestEntry[];
  readonly reports: readonly SubsetReport[];
}

const IMAGE_NAME = /^(\d+)\.png$/;

/**
 * Samples `perSubset` images per subset reproducibly. In UniMER-Test, image `0000123.png`
 * is labelled by line 123 (0-based) of `<subset>.txt`. Labels KaTeX cannot render are
 * skipped, since they cannot be render-matched and would never reach a Snip user anyway.
 */
export async function importUnimer(options: UnimerImportOptions): Promise<UnimerImport> {
  const entries: ManifestEntry[] = [];
  const reports: SubsetReport[] = [];

  for (const subset of options.subsets) {
    const imageDir = path.join(options.sourceDir, subset);
    const labels = (await readFile(path.join(options.sourceDir, `${subset}.txt`), 'utf8')).split(
      '\n',
    );
    const images = (await readdir(imageDir)).filter((name) => IMAGE_NAME.test(name)).sort();
    // Seed per subset so adding or removing a subset does not change the others' samples.
    const rng = createRng(options.seed + subsetOffset(subset));

    let skipped = 0;
    let selected = 0;
    for (const image of shuffled(images, rng)) {
      if (selected >= options.perSubset) break;
      const index = Number(IMAGE_NAME.exec(image)?.[1]);
      const latex = labels[index]?.trim() ?? '';
      if (latex === '' || !validateLatex(latex).ok) {
        skipped++;
        continue;
      }
      entries.push({
        id: `${subset}-${path.parse(image).name}`,
        image: path.relative(options.outDir, path.join(imageDir, image)),
        latex,
        category: UNIMER_SUBSETS[subset],
        source: `UniMER-Test/${subset}/${image}`,
      });
      selected++;
    }

    reports.push({ subset, available: images.length, selected, skipped });
  }

  return { entries, reports };
}

export async function writeManifest(
  file: string,
  entries: readonly ManifestEntry[],
  header: string,
): Promise<void> {
  const lines = [`// ${header}`, ...entries.map((entry) => JSON.stringify(entry))];
  await writeFile(file, lines.join('\n') + '\n');
}

function subsetOffset(subset: UnimerSubset): number {
  return Object.keys(UNIMER_SUBSETS).indexOf(subset) * 1_000_003;
}
