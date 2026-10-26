import type { ImageMimeType } from '@snip/engine';

/**
 * Identifies an image by its leading bytes rather than trusting the Content-Type header.
 * Returns null for anything that is not PNG, JPEG or WebP.
 */
export function detectImageType(bytes: Uint8Array): ImageMimeType | null {
  const startsWith = (signature: readonly number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  // "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
