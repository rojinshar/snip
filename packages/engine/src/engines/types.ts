export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface OcrImage {
  readonly data: Buffer;
  readonly mimeType: ImageMimeType;
}

export interface OcrUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

/** How sure the engine was, from the probabilities it gave each emitted token. */
export interface OcrConfidence {
  /** Geometric mean token probability, in (0, 1]. */
  readonly mean: number;
  /** Probability of the least confident token, in (0, 1]. */
  readonly min: number;
}

export interface OcrEngineOutput {
  /** LaTeX with surrounding delimiters and code fences already removed. */
  readonly latex: string;
  readonly usage?: OcrUsage;
  /** Present only for engines that expose token probabilities. */
  readonly confidence?: OcrConfidence;
}

export interface RecognizeOptions {
  readonly signal?: AbortSignal;
}

/** A single image-to-LaTeX backend. Implementations must be stateless per call. */
export interface OcrEngine {
  readonly id: string;
  recognize(image: OcrImage, options?: RecognizeOptions): Promise<OcrEngineOutput>;
}
