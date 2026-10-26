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

export interface OcrEngineOutput {
  /** LaTeX with surrounding delimiters and code fences already removed. */
  readonly latex: string;
  readonly usage?: OcrUsage;
}

export interface RecognizeOptions {
  readonly signal?: AbortSignal;
}

/** A single image-to-LaTeX backend. Implementations must be stateless per call. */
export interface OcrEngine {
  readonly id: string;
  recognize(image: OcrImage, options?: RecognizeOptions): Promise<OcrEngineOutput>;
}
