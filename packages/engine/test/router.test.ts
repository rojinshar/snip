import { describe, expect, it } from 'vitest';

import type { OcrConfidence, OcrEngine, OcrEngineOutput, OcrImage } from '../src/engines/types.ts';
import { OcrRouter, type RouterStep } from '../src/router.ts';

const image: OcrImage = { data: Buffer.from(''), mimeType: 'image/png' };

function engine(
  id: string,
  behavior: string | Error,
  options: { costUsd?: number; confidence?: OcrConfidence; retries?: number } = {},
): OcrEngine {
  return {
    id,
    recognize: (): Promise<OcrEngineOutput> =>
      behavior instanceof Error
        ? Promise.reject(behavior)
        : Promise.resolve({
            latex: behavior,
            usage: { inputTokens: 1, outputTokens: 1, costUsd: options.costUsd ?? 0.001 },
            ...(options.confidence ? { confidence: options.confidence } : {}),
            ...(options.retries ? { retries: options.retries } : {}),
          }),
  };
}

const steps = (...engines: OcrEngine[]): RouterStep[] => engines.map((e) => ({ engine: e }));
const gate = { metric: 'mean', threshold: 0.98 } as const;

describe('OcrRouter', () => {
  it('returns the first engine output that renders', async () => {
    const router = new OcrRouter(steps(engine('lite', 'x^2'), engine('flash', 'y^2')));
    const result = await router.recognize(image);

    expect(result).toMatchObject({ status: 'ok', latex: 'x^2', engineId: 'lite', degraded: false });
    expect(result.attempts.map((a) => a.outcome)).toEqual(['accepted']);
  });

  it('falls through on invalid LaTeX and on engine errors', async () => {
    const router = new OcrRouter(
      steps(
        engine('lite', '\\frac{a'),
        engine('flash', new Error('timeout')),
        engine('fallback', '\\frac{a}{b}'),
      ),
    );
    const result = await router.recognize(image);

    expect(result).toMatchObject({ status: 'ok', engineId: 'fallback' });
    expect(result.attempts.map((a) => [a.engineId, a.outcome])).toEqual([
      ['lite', 'invalid'],
      ['flash', 'error'],
      ['fallback', 'accepted'],
    ]);
    expect(result.attempts[1]?.detail).toBe('timeout');
  });

  it('stops on empty output instead of asking the next engine', async () => {
    const router = new OcrRouter(steps(engine('lite', ''), engine('flash', 'x^2')));
    const result = await router.recognize(image);

    expect(result.status).toBe('failed');
    expect(result.attempts.map((a) => [a.engineId, a.outcome])).toEqual([['lite', 'empty']]);
  });

  it('accepts text with math segments and escalates text whose math is broken', async () => {
    const good = new OcrRouter(steps(engine('lite', 'Roots are $x = 1$ and $x = 2$.')));
    expect(await good.recognize(image)).toMatchObject({ status: 'ok', engineId: 'lite' });

    const broken = new OcrRouter(
      steps(engine('lite', 'Roots are $\\frac{1$ and more.'), engine('flash', 'x = 1')),
    );
    expect(await broken.recognize(image)).toMatchObject({ status: 'ok', engineId: 'flash' });
  });

  it('records how many retries an attempt took', async () => {
    const router = new OcrRouter(steps(engine('lite', 'x^2', { retries: 1 })));
    const result = await router.recognize(image);

    expect(result.attempts[0]).toMatchObject({ engineId: 'lite', retries: 1 });
  });

  it('sums cost across every attempt', async () => {
    const router = new OcrRouter(
      steps(
        engine('lite', '\\frac{a', { costUsd: 0.001 }),
        engine('flash', 'x', { costUsd: 0.002 }),
      ),
    );
    const result = await router.recognize(image);
    expect(result.costUsd).toBeCloseTo(0.003);
  });

  it('fails when no engine produces valid LaTeX', async () => {
    const router = new OcrRouter(
      steps(engine('lite', '\\frac{a'), engine('flash', new Error('down'))),
    );
    const result = await router.recognize(image);
    expect(result.status).toBe('failed');
    expect(result.attempts).toHaveLength(2);
  });

  it('measures latency with the injected clock', async () => {
    let tick = 0;
    const router = new OcrRouter(steps(engine('lite', 'x')), { now: () => (tick += 10) });
    const result = await router.recognize(image);
    expect(result.attempts[0]?.latencyMs).toBe(10);
    // Clock reads: start=10, attempt start=20, attempt end=30, finish=40.
    expect(result.latencyMs).toBe(30);
  });

  it('rejects an empty step list', () => {
    expect(() => new OcrRouter([])).toThrow();
  });

  describe('confidence gate', () => {
    it('accepts output at or above the threshold', async () => {
      const router = new OcrRouter([
        {
          engine: engine('uni', 'x', { confidence: { mean: 0.98, min: 0.2 } }),
          minConfidence: gate,
        },
        { engine: engine('gemini', 'y') },
      ]);
      const result = await router.recognize(image);
      expect(result).toMatchObject({ status: 'ok', engineId: 'uni', degraded: false });
    });

    it('falls through below the threshold and records why', async () => {
      const router = new OcrRouter([
        {
          engine: engine('uni', 'x', { confidence: { mean: 0.9, min: 0.5 } }),
          minConfidence: gate,
        },
        { engine: engine('gemini', 'y') },
      ]);
      const result = await router.recognize(image);

      expect(result).toMatchObject({ status: 'ok', engineId: 'gemini', latex: 'y' });
      expect(result.attempts[0]).toMatchObject({
        outcome: 'low-confidence',
        confidence: { mean: 0.9, min: 0.5 },
        detail: 'mean confidence 0.900 < 0.98',
      });
    });

    it('treats a missing confidence score as failing the gate', async () => {
      const router = new OcrRouter([
        { engine: engine('uni', 'x'), minConfidence: gate },
        { engine: engine('gemini', 'y') },
      ]);
      const result = await router.recognize(image);
      expect(result.attempts[0]?.detail).toBe('mean confidence missing < 0.98');
    });

    it('returns the low-confidence output as degraded when later steps fail', async () => {
      const router = new OcrRouter([
        {
          engine: engine('uni', 'x', { confidence: { mean: 0.5, min: 0.1 } }),
          minConfidence: gate,
        },
        { engine: engine('gemini', new Error('503')) },
      ]);
      const result = await router.recognize(image);

      expect(result).toMatchObject({ status: 'ok', latex: 'x', engineId: 'uni', degraded: true });
      expect(result.attempts.map((a) => a.outcome)).toEqual(['low-confidence', 'error']);
    });
  });
});
