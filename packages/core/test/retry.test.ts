import { describe, expect, it, vi } from 'vitest';

import { OcrEngineError } from '../src/errors.ts';
import { withRetry } from '../src/retry.ts';

const policy = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 };
const noSleep = () => Promise.resolve();

describe('withRetry', () => {
  it('retries retryable errors until success', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new OcrEngineError('e', 'rate limited', { retryable: true }))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(fn, policy, noSleep)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const error = new OcrEngineError('e', 'bad request', { retryable: false });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withRetry(fn, policy, noSleep)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new OcrEngineError('e', 'unavailable', { retryable: true }));

    await expect(withRetry(fn, policy, noSleep)).rejects.toThrow('unavailable');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
