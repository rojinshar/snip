import { afterEach, describe, expect, it, vi } from 'vitest';

import { UnimernetEngine } from '../src/engines/unimernet.ts';
import { OcrEngineError } from '../src/errors.ts';

const image = { data: Buffer.from('png-bytes'), mimeType: 'image/png' as const };
const noRetry = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('UnimernetEngine', () => {
  it('posts the raw image and returns sanitized LaTeX at zero cost', async () => {
    const fetchMock = stubFetch(
      Response.json({ latex: '$x ^ { 2 }$', inference_ms: 12.5, device: 'mps' }),
    );
    const engine = new UnimernetEngine({ baseUrl: 'http://127.0.0.1:8765' });

    const output = await engine.recognize(image);

    expect(output).toEqual({
      latex: 'x ^ { 2 }',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:8765/v1/recognize');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'image/png' });
    expect(init?.body).toBe(image.data);
  });

  it('marks 5xx responses retryable and 4xx not', async () => {
    stubFetch(new Response('boom', { status: 503 }));
    const engine = new UnimernetEngine({ baseUrl: 'http://x.test', retryPolicy: noRetry });
    await expect(engine.recognize(image)).rejects.toMatchObject({ retryable: true });

    stubFetch(new Response('bad image', { status: 400 }));
    await expect(engine.recognize(image)).rejects.toMatchObject({ retryable: false });
  });

  it('reports an unreachable server clearly', async () => {
    stubFetch(new TypeError('fetch failed'));
    const engine = new UnimernetEngine({ baseUrl: 'http://x.test', retryPolicy: noRetry });

    const error = await engine.recognize(image).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OcrEngineError);
    expect((error as Error).message).toContain('cannot reach http://x.test/v1/recognize');
  });
});
