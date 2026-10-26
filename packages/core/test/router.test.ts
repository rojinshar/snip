import { describe, expect, it } from 'vitest';

import type { OcrEngine, OcrEngineOutput, OcrImage } from '../src/engines/types.ts';
import { OcrRouter } from '../src/router.ts';

const image: OcrImage = { data: Buffer.from(''), mimeType: 'image/png' };

function engine(id: string, behavior: string | Error, costUsd = 0.001): OcrEngine {
  return {
    id,
    recognize: (): Promise<OcrEngineOutput> =>
      behavior instanceof Error
        ? Promise.reject(behavior)
        : Promise.resolve({ latex: behavior, usage: { inputTokens: 1, outputTokens: 1, costUsd } }),
  };
}

describe('OcrRouter', () => {
  it('returns the first engine output that renders', async () => {
    const router = new OcrRouter([engine('lite', 'x^2'), engine('flash', 'y^2')]);
    const result = await router.recognize(image);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.latex).toBe('x^2');
    expect(result.engineId).toBe('lite');
    expect(result.attempts.map((a) => a.outcome)).toEqual(['accepted']);
  });

  it('falls through on invalid LaTeX and on engine errors', async () => {
    const router = new OcrRouter([
      engine('lite', '\\frac{a'),
      engine('flash', new Error('timeout')),
      engine('fallback', '\\frac{a}{b}'),
    ]);
    const result = await router.recognize(image);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.engineId).toBe('fallback');
    expect(result.attempts.map((a) => [a.engineId, a.outcome])).toEqual([
      ['lite', 'invalid'],
      ['flash', 'error'],
      ['fallback', 'accepted'],
    ]);
    expect(result.attempts[1]?.detail).toBe('timeout');
  });

  it('sums cost across every attempt', async () => {
    const router = new OcrRouter([engine('lite', '\\frac{a', 0.001), engine('flash', 'x', 0.002)]);
    const result = await router.recognize(image);
    expect(result.costUsd).toBeCloseTo(0.003);
  });

  it('fails when no engine produces valid LaTeX', async () => {
    const router = new OcrRouter([engine('lite', ''), engine('flash', new Error('down'))]);
    const result = await router.recognize(image);
    expect(result.status).toBe('failed');
    expect(result.attempts).toHaveLength(2);
  });

  it('measures latency with the injected clock', async () => {
    let tick = 0;
    const router = new OcrRouter([engine('lite', 'x')], { now: () => (tick += 10) });
    const result = await router.recognize(image);
    expect(result.attempts[0]?.latencyMs).toBe(10);
    // Clock reads: start=10, attempt start=20, attempt end=30, finish=40.
    expect(result.latencyMs).toBe(30);
  });

  it('rejects an empty engine list', () => {
    expect(() => new OcrRouter([])).toThrow();
  });
});
