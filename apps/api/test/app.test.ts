import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { MAX_IMAGE_BYTES, createApp } from '../src/app.ts';
import type { RecognizeResult, Recognizer } from '../src/recognize.ts';
import { JPEG, PNG } from './helpers.ts';

function setup(result: RecognizeResult | Error = { ok: true, latex: 'x^2', engine: 'lite' }) {
  const lines: Record<string, unknown>[] = [];
  const recognize = vi.fn<Recognizer['recognize']>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  let clock = 0;
  const app = createApp({
    recognizer: { recognize },
    logger: {
      info: (msg, fields) => lines.push({ level: 'info', msg, ...fields }),
      error: (msg, fields) => lines.push({ level: 'error', msg, ...fields }),
    },
    now: () => (clock += 100),
    requestId: () => 'req-1',
  });
  return { app, recognize, lines };
}

const postImage = (app: ReturnType<typeof setup>['app'], body: Buffer, type = 'image/png') =>
  request(app).post('/v1/recognize').set('content-type', type).send(body);

describe('GET /healthz', () => {
  it('reports ok', async () => {
    const { app } = setup();
    await request(app).get('/healthz').expect(200, { status: 'ok' });
  });
});

describe('POST /v1/recognize', () => {
  it('returns LaTeX, the engine and the recognition time', async () => {
    const { app, recognize } = setup();

    const res = await postImage(app, PNG).expect(200);

    expect(res.body).toEqual({ latex: 'x^2', engine: 'lite', ms: 100 });
    expect(res.headers['x-request-id']).toBe('req-1');
    expect(recognize).toHaveBeenCalledWith({ data: PNG, mimeType: 'image/png' });
  });

  it('detects the type from the bytes, not the header', async () => {
    const { app, recognize } = setup();
    await postImage(app, JPEG, 'application/octet-stream').expect(200);
    expect(recognize.mock.calls[0]?.[0].mimeType).toBe('image/jpeg');
  });

  it.each([
    ['not an image', Buffer.from('hello world')],
    ['an empty body', Buffer.alloc(0)],
  ])('rejects %s with 400 invalid_image', async (_name, body) => {
    const { app, recognize } = setup();
    const res = await postImage(app, body).expect(400);
    expect(res.body).toEqual({ error: 'invalid_image', message: 'Could not read that image.' });
    expect(recognize).not.toHaveBeenCalled();
  });

  it('rejects bodies over 10 MB with 413', async () => {
    const { app, recognize } = setup();
    const res = await postImage(app, Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)])).expect(
      413,
    );
    expect(res.body).toMatchObject({ error: 'image_too_large' });
    expect(recognize).not.toHaveBeenCalled();
  });

  it('maps no_math_found to 422', async () => {
    const { app } = setup({ ok: false, error: 'no_math_found', detail: 'lite: empty output' });
    const res = await postImage(app, PNG).expect(422);
    expect(res.body).toEqual({
      error: 'no_math_found',
      message: 'No equation found in the selection.',
    });
  });

  it('maps upstream_failed to 502', async () => {
    const { app } = setup({ ok: false, error: 'upstream_failed', detail: 'lite: 503' });
    const res = await postImage(app, PNG).expect(502);
    expect(res.body).toMatchObject({ error: 'upstream_failed' });
  });

  it('turns an unexpected exception into a 500 without leaking details', async () => {
    const { app } = setup(new Error('secret stack detail'));
    const res = await postImage(app, PNG).expect(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
  });
});

describe('request logging', () => {
  it('writes one structured line per request, without image data', async () => {
    const { app, lines } = setup();
    await postImage(app, PNG).expect(200);

    expect(lines).toEqual([
      {
        level: 'info',
        msg: 'request',
        id: 'req-1',
        method: 'POST',
        path: '/v1/recognize',
        status: 200,
        ms: expect.any(Number) as number,
        engine: 'lite',
      },
    ]);
  });

  it('includes the failure detail for diagnosis', async () => {
    const { app, lines } = setup({ ok: false, error: 'upstream_failed', detail: 'lite: 503' });
    await postImage(app, PNG).expect(502);
    expect(lines[0]).toMatchObject({ status: 502, detail: 'lite: 503' });
  });
});
