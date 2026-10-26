import type { OcrEngine, OcrEngineOutput, OcrImage, RecognizeOptions } from '@snip/engine';

/**
 * Spaces calls so that at most `requestsPerMinute` start in any minute. Callers await
 * `acquire()` right before each request. Slots are handed out in call order.
 */
export class RateLimiter {
  private readonly intervalMs: number;
  private nextSlotAt = 0;

  constructor(
    requestsPerMinute: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    if (!(requestsPerMinute > 0)) throw new Error('requestsPerMinute must be positive');
    this.intervalMs = 60_000 / requestsPerMinute;
  }

  async acquire(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + this.intervalMs;
    if (slot > now) await this.sleep(slot - now);
  }
}

/** Wraps an engine so every call first waits for a slot from `limiter`. */
export class RateLimitedEngine implements OcrEngine {
  readonly id: string;

  constructor(
    private readonly engine: OcrEngine,
    private readonly limiter: RateLimiter,
  ) {
    this.id = engine.id;
  }

  async recognize(image: OcrImage, options?: RecognizeOptions): Promise<OcrEngineOutput> {
    await this.limiter.acquire();
    return this.engine.recognize(image, options);
  }
}
