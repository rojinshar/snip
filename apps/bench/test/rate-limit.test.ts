import { describe, expect, it } from 'vitest';

import type { OcrEngine } from '@snip/engine';

import { RateLimitedEngine, RateLimiter } from '../src/rate-limit.ts';

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

describe('RateLimitedEngine', () => {
  it('waits for a slot before every call and keeps the engine id', async () => {
    const order: string[] = [];
    const limiter = {
      acquire: () => {
        order.push('acquire');
        return Promise.resolve();
      },
    };
    const engine: OcrEngine = {
      id: 'gemini-3.5-flash-lite',
      recognize: () => {
        order.push('recognize');
        return Promise.resolve({ latex: 'x' });
      },
    };
    const limited = new RateLimitedEngine(engine, limiter as unknown as RateLimiter);

    await limited.recognize({ data: Buffer.from(''), mimeType: 'image/png' });

    expect(limited.id).toBe('gemini-3.5-flash-lite');
    expect(order).toEqual(['acquire', 'recognize']);
  });
});
