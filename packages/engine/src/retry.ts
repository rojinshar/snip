import { OcrEngineError } from './errors.ts';

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

/**
 * Runs `fn`, retrying only on retryable OcrEngineErrors with full-jitter exponential backoff.
 * `fn` receives the 1-based attempt number.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      const retryable = error instanceof OcrEngineError && error.retryable;
      if (!retryable || attempt >= policy.maxAttempts) throw error;
      const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
      await sleep(Math.random() * ceiling);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
