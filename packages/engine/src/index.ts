export type {
  ImageMimeType,
  OcrConfidence,
  OcrEngine,
  OcrEngineOutput,
  OcrImage,
  OcrUsage,
  RecognizeOptions,
} from './engines/types.ts';
export {
  GEMINI_PRESETS,
  GeminiEngine,
  type GeminiEngineConfig,
  type GeminiPresetName,
  type TokenPricing,
} from './engines/gemini.ts';
export { MathpixEngine, type MathpixEngineConfig } from './engines/mathpix.ts';
export { LATEX_OCR_PROMPT } from './engines/prompt.ts';
export { UnimernetEngine, type UnimernetEngineConfig } from './engines/unimernet.ts';
export { OcrEngineError } from './errors.ts';
export {
  compareLatex,
  editDistance,
  normalizeLatex,
  tokenizeLatex,
  type LatexComparison,
} from './latex/compare.ts';
export { sanitizeModelOutput } from './latex/sanitize.ts';
export { renderedSymbols } from './latex/symbols.ts';
export { classifyOutput, splitMath, type OutputKind, type Segment } from './latex/segments.ts';
export { validateLatex, validateOutput, type ValidationResult } from './latex/validate.ts';
export { DEFAULT_RETRY_POLICY, withRetry, type RetryPolicy } from './retry.ts';
export {
  OcrRouter,
  type AttemptOutcome,
  type ConfidenceGate,
  type OcrRouterOptions,
  type RouterStep,
  type RouterAttempt,
  type RouterResult,
} from './router.ts';
