import { describe, expect, it } from 'vitest';

import { detectImageType } from '../src/image.ts';
import { JPEG, PNG, WEBP } from './helpers.ts';

describe('detectImageType', () => {
  it.each([
    [PNG, 'image/png'],
    [JPEG, 'image/jpeg'],
    [WEBP, 'image/webp'],
  ] as const)('recognizes %#', (bytes, expected) => {
    expect(detectImageType(bytes)).toBe(expected);
  });

  it.each([Buffer.from('GIF89a......'), Buffer.from('not an image'), Buffer.alloc(0)])(
    'rejects %j',
    (bytes) => {
      expect(detectImageType(bytes)).toBeNull();
    },
  );

  it('rejects RIFF files that are not WebP', () => {
    expect(
      detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])),
    ).toBeNull();
  });
});
