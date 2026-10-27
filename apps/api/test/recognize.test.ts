import { OcrRouter, type OcrEngine } from '@snip/engine';
import { describe, expect, it } from 'vitest';

import { createRouterRecognizer } from '../src/recognize.ts';
import { PNG } from './helpers.ts';

const image = { data: PNG, mimeType: 'image/png' as const };

const answers = (id: string, latex: string): OcrEngine => ({
  id,
  recognize: () => Promise.resolve({ latex }),
});
const fails = (id: string, message: string): OcrEngine => ({
  id,
  recognize: () => Promise.reject(new Error(message)),
});

const recognizerFor = (...engines: OcrEngine[]) =>
  createRouterRecognizer(new OcrRouter(engines.map((engine) => ({ engine }))));

describe('createRouterRecognizer', () => {
  it('returns the first renderable LaTeX and the engine that produced it', async () => {
    const result = await recognizerFor(answers('lite', 'x^2'), answers('flash', 'y')).recognize(
      image,
    );
    expect(result).toMatchObject({ ok: true, latex: 'x^2', engine: 'lite' });
  });

  it('falls back when the first engine returns unrenderable LaTeX', async () => {
    const result = await recognizerFor(
      answers('lite', '\\frac{a'),
      answers('flash', '\\frac{a}{b}'),
    ).recognize(image);
    expect(result).toMatchObject({ ok: true, latex: '\\frac{a}{b}', engine: 'flash' });
  });

  it('summarizes every attempt for the request log, without the LaTeX', async () => {
    const counted: OcrEngine = {
      id: 'lite',
      recognize: () =>
        Promise.resolve({
          latex: 'x^2',
          usage: { inputTokens: 1159, outputTokens: 25, costUsd: 0 },
          retries: 1,
        }),
    };
    const result = await recognizerFor(answers('broken', '\\frac{a'), counted).recognize(image);
    expect(result.attempts).toEqual([
      { engine: 'broken', outcome: 'invalid', ms: expect.any(Number) as number },
      {
        engine: 'lite',
        outcome: 'accepted',
        ms: expect.any(Number) as number,
        inputTokens: 1159,
        outputTokens: 25,
        retries: 1,
      },
    ]);
  });

  it('reports no_math_found when every engine answered but none rendered', async () => {
    const result = await recognizerFor(answers('lite', ''), answers('flash', '')).recognize(image);
    expect(result).toMatchObject({ ok: false, error: 'no_math_found' });
  });

  it('reports upstream_failed when any engine errored', async () => {
    const result = await recognizerFor(
      answers('lite', ''),
      fails('flash', '503 overloaded'),
    ).recognize(image);
    expect(result).toMatchObject({ ok: false, error: 'upstream_failed' });
    if (!result.ok) expect(result.detail).toContain('503 overloaded');
  });
});
