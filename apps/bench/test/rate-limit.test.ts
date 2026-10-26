import { describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/rate-limit.ts';

describe('RateLimiter', () => {
  it('spaces consecutive acquisitions by 60s / rpm', async () => {
    const clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      30,
      () => clock,
      (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    );

    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);

    expect(sleeps).toEqual([2000, 4000]);
  });

  it('does not wait once the interval has passed', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      60,
      () => clock,
      (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    );

    await limiter.acquire();
    clock = 5_000;
    await limiter.acquire();

    expect(sleeps).toEqual([]);
  });

  it('rejects a non-positive rate', () => {
    expect(() => new RateLimiter(0)).toThrow();
  });
});
