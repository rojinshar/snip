export class OcrEngineError extends Error {
  readonly engineId: string;
  /** True when the same request may succeed if retried (rate limits, 5xx, timeouts). */
  readonly retryable: boolean;

  constructor(engineId: string, message: string, options: { retryable: boolean; cause?: unknown }) {
    super(`[${engineId}] ${message}`, { cause: options.cause });
    this.name = 'OcrEngineError';
    this.engineId = engineId;
    this.retryable = options.retryable;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
