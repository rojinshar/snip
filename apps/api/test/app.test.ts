import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { KeyUsage } from '../src/access.ts';
import type { AccessStore, SnipRecord } from '../src/access-store.ts';
import { type AccessControl, MAX_IMAGE_BYTES, createApp } from '../src/app.ts';
import { hashAccessKey } from '../src/keys.ts';
import type { RecognizeResult, Recognizer } from '../src/recognize.ts';
import { JPEG, PNG } from './helpers.ts';

const attempts = [
  { engine: 'lite', outcome: 'accepted', ms: 900, inputTokens: 1159, outputTokens: 25 },
] as const;
const success: RecognizeResult = {
  ok: true,
  latex: 'x^2',
  engine: 'lite',
  kind: 'math',
  attempts,
  costUsd: 0.0004,
};

const KEY = 'snip_abcdefghijklmnopqrstuvwx23';
const usage = (overrides: Partial<KeyUsage> = {}): KeyUsage => ({
  keyId: 7,
  monthlyQuota: 200,
  revoked: false,
  usedThisMonth: 3,
  requestsLastMinute: 0,
  spentTodayUsd: 0,
  ...overrides,
});

/** In-memory AccessStore: one known key, and every recorded row kept for assertions. */
function fakeStore(known: KeyUsage | null = usage()) {
  const records: SnipRecord[] = [];
  const store: AccessStore = {
    usage: (keyHash) => Promise.resolve(keyHash === hashAccessKey(KEY) ? known : null),
    record: (snip) => {
      records.push(snip);
      return Promise.resolve();
    },
  };
  return { store, records };
}

function setup(
  options: { result?: RecognizeResult | Error; access?: Omit<AccessControl, 'limits'> } = {},
) {
  const result = options.result ?? success;
  const lines: Record<string, unknown>[] = [];
  const recognize = vi.fn<Recognizer['recognize']>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const deferred: Promise<unknown>[] = [];
  let clock = 0;
  const app = createApp({
    recognizer: { recognize },
    logger: {
      info: (msg, fields) => lines.push({ level: 'info', msg, ...fields }),
      error: (msg, fields) => lines.push({ level: 'error', msg, ...fields }),
    },
    now: () => (clock += 100),
    clock: () => new Date('2026-10-26T12:00:00Z'),
    requestId: () => 'req-1',
    ...(options.access
      ? {
          access: {
            limits: { requestsPerMinute: 10, dailySpendCapUsd: 2 },
            defer: (work) => deferred.push(work),
            ...options.access,
          },
        }
      : {}),
  });
  return { app, recognize, lines, deferred };
}

const postImage = (app: ReturnType<typeof setup>['app'], body: Buffer, type = 'image/png') =>
  request(app).post('/v1/recognize').set('content-type', type).send(body);
const withKey = (key = KEY) => `Bearer ${key}`;

describe('GET /healthz', () => {
  it('reports ok, with or without access keys', async () => {
    await request(setup().app).get('/healthz').expect(200, { status: 'ok' });
    const { store } = fakeStore();
    await request(setup({ access: { store } }).app)
      .get('/healthz')
      .expect(200);
  });
});

describe('POST /v1/recognize', () => {
  it('returns LaTeX, the engine and the recognition time', async () => {
    const { app, recognize } = setup();

    const res = await postImage(app, PNG).expect(200);

    expect(res.body).toEqual({ latex: 'x^2', kind: 'math', engine: 'lite', ms: 100 });
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
    const { app } = setup({
      result: {
        ok: false,
        error: 'no_math_found',
        detail: 'lite: empty output',
        attempts: [],
        costUsd: 0,
      },
    });
    const res = await postImage(app, PNG).expect(422);
    expect(res.body).toEqual({
      error: 'no_math_found',
      message: 'No equation found in the selection.',
    });
  });

  it('maps upstream_failed to 502', async () => {
    const { app } = setup({
      result: {
        ok: false,
        error: 'upstream_failed',
        detail: 'lite: 503',
        attempts: [],
        costUsd: 0,
      },
    });
    const res = await postImage(app, PNG).expect(502);
    expect(res.body).toMatchObject({ error: 'upstream_failed' });
  });

  it('turns an unexpected exception into a 500 without leaking details', async () => {
    const { app } = setup({ result: new Error('secret stack detail') });
    const res = await postImage(app, PNG).expect(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
  });
});

describe('access keys', () => {
  it('rejects a missing, unknown or revoked key with 401, before recognizing', async () => {
    const { store, records } = fakeStore();
    const { app, recognize } = setup({ access: { store } });

    const missing = await postImage(app, PNG).expect(401);
    expect(missing.body).toEqual({ error: 'invalid_key', message: "That access key isn't valid." });
    await postImage(app, PNG).set('authorization', withKey('snip_other')).expect(401);

    const revoked = fakeStore(usage({ revoked: true }));
    await postImage(setup({ access: { store: revoked.store } }).app, PNG)
      .set('authorization', withKey())
      .expect(401);

    expect(recognize).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it('recognizes with a valid key and records the usage after responding', async () => {
    const { store, records } = fakeStore();
    const { app, deferred, lines } = setup({ access: { store } });

    await postImage(app, PNG).set('authorization', withKey()).expect(200);
    await Promise.all(deferred);

    expect(records).toEqual([
      {
        keyId: 7,
        status: 200,
        engine: 'lite',
        inputTokens: 1159,
        outputTokens: 25,
        costUsd: 0.0004,
        ms: 100,
      },
    ]);
    expect(lines[0]).toMatchObject({ keyId: 7, status: 200 });
  });

  it('records recognitions that found no math, since they still cost money', async () => {
    const { store, records } = fakeStore();
    const { app, deferred } = setup({
      access: { store },
      result: { ok: false, error: 'no_math_found', detail: '', attempts, costUsd: 0.0003 },
    });

    await postImage(app, PNG).set('authorization', withKey()).expect(422);
    await Promise.all(deferred);

    expect(records).toMatchObject([{ status: 422, costUsd: 0.0003 }]);
    expect(records[0]).not.toHaveProperty('engine');
  });

  it('does not record requests rejected before recognition', async () => {
    const { store, records } = fakeStore();
    const { app, deferred } = setup({ access: { store } });
    await postImage(app, Buffer.from('nope')).set('authorization', withKey()).expect(400);
    await Promise.all(deferred);
    expect(records).toEqual([]);
  });

  it('answers 429 quota_exceeded with when the quota resets', async () => {
    const { store } = fakeStore(usage({ usedThisMonth: 200 }));
    const { app, recognize } = setup({ access: { store } });

    const res = await postImage(app, PNG).set('authorization', withKey()).expect(429);

    expect(res.body).toEqual({
      error: 'quota_exceeded',
      message: "You've used this month's snips.",
      resetsAt: '2026-11-01T00:00:00.000Z',
    });
    expect(recognize).not.toHaveBeenCalled();
  });

  it('answers 429 rate_limited after too many requests in a minute', async () => {
    const { store } = fakeStore(usage({ requestsLastMinute: 10 }));
    const res = await postImage(setup({ access: { store } }).app, PNG)
      .set('authorization', withKey())
      .expect(429);
    expect(res.body).toMatchObject({ error: 'rate_limited' });
  });

  it('answers 503 capacity once the daily spending cap is reached', async () => {
    const { store } = fakeStore(usage({ spentTodayUsd: 2 }));
    const res = await postImage(setup({ access: { store } }).app, PNG)
      .set('authorization', withKey())
      .expect(503);
    expect(res.body).toEqual({
      error: 'capacity',
      message: 'Snip is busy right now. Try again later.',
    });
  });

  it('answers 500 without recognizing when the key lookup fails', async () => {
    const { store } = fakeStore();
    const broken: AccessStore = {
      ...store,
      usage: () => Promise.reject(new Error('database unavailable')),
    };
    const { app, recognize } = setup({ access: { store: broken } });
    const res = await postImage(app, PNG).set('authorization', withKey()).expect(500);
    expect(res.body).toMatchObject({ error: 'internal_error' });
    expect(recognize).not.toHaveBeenCalled();
  });

  it('still answers when recording the usage fails, and logs why', async () => {
    const { store } = fakeStore();
    const failing: AccessStore = {
      ...store,
      record: () => Promise.reject(new Error('database unavailable')),
    };
    const { app, deferred, lines } = setup({ access: { store: failing } });

    await postImage(app, PNG).set('authorization', withKey()).expect(200);
    await Promise.all(deferred);

    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'could not record usage',
        detail: 'database unavailable',
      }),
    );
  });
});

describe('GET /v1/me', () => {
  it('reports the quota, usage and reset time for a valid key', async () => {
    const { store } = fakeStore(usage({ usedThisMonth: 37 }));
    const res = await request(setup({ access: { store } }).app)
      .get('/v1/me')
      .set('authorization', withKey())
      .expect(200);
    expect(res.body).toEqual({ quota: 200, used: 37, resetsAt: '2026-11-01T00:00:00.000Z' });
  });

  it('works even when the key is over quota or rate-limited', async () => {
    const { store } = fakeStore(usage({ usedThisMonth: 200, requestsLastMinute: 50 }));
    await request(setup({ access: { store } }).app)
      .get('/v1/me')
      .set('authorization', withKey())
      .expect(200);
  });

  it('rejects a missing or revoked key with 401', async () => {
    const { store } = fakeStore(usage({ revoked: true }));
    const { app } = setup({ access: { store } });
    await request(app).get('/v1/me').expect(401);
    await request(app).get('/v1/me').set('authorization', withKey()).expect(401);
  });

  it('reports no quota when access keys are off (local development)', async () => {
    const res = await request(setup().app).get('/v1/me').expect(200);
    expect(res.body).toEqual({ quota: null, used: null, resetsAt: null });
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
        bytes: PNG.length,
        engine: 'lite',
        attempts,
      },
    ]);
  });

  it('includes the failure detail for diagnosis', async () => {
    const { app, lines } = setup({
      result: {
        ok: false,
        error: 'upstream_failed',
        detail: 'lite: 503',
        attempts: [],
        costUsd: 0,
      },
    });
    await postImage(app, PNG).expect(502);
    expect(lines[0]).toMatchObject({ status: 502, detail: 'lite: 503' });
  });
});
