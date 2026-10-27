import { describe, expect, it, vi } from 'vitest';

import { handleWaitlistRequest, type WaitlistSignup } from '../src/lib/waitlist';

function post(body: unknown): Request {
  return new Request('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function memoryRepository() {
  const signups: WaitlistSignup[] = [];
  return { signups, add: (signup: WaitlistSignup) => Promise.resolve(void signups.push(signup)) };
}

const silent = { error: vi.fn() };

describe('handleWaitlistRequest', () => {
  it('stores a normalized email and the campaign source', async () => {
    const repo = memoryRepository();

    const response = await handleWaitlistRequest(
      post({ email: '  Student@Vanderbilt.EDU ', source: 'Reddit-LaTeX' }),
      repo,
      silent,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(repo.signups).toEqual([{ email: 'student@vanderbilt.edu', source: 'reddit-latex' }]);
  });

  it('stores direct for visitors who arrived without a ref', async () => {
    const repo = memoryRepository();
    await handleWaitlistRequest(post({ email: 'a@b.co', source: 'direct' }), repo, silent);
    expect(repo.signups).toEqual([{ email: 'a@b.co', source: 'direct' }]);
  });

  it('ignores a malformed source instead of rejecting the sign-up', async () => {
    const repo = memoryRepository();
    await handleWaitlistRequest(post({ email: 'a@b.co', source: '<script>' }), repo, silent);
    expect(repo.signups).toEqual([{ email: 'a@b.co' }]);
  });

  it.each([{ email: 'not-an-email' }, { email: '' }, {}, { email: `${'a'.repeat(250)}@b.co` }])(
    'rejects %j with 400',
    async (body) => {
      const repo = memoryRepository();
      const response = await handleWaitlistRequest(post(body), repo, silent);
      expect(response.status).toBe(400);
      expect(repo.signups).toEqual([]);
    },
  );

  it('rejects a body that is not JSON', async () => {
    const response = await handleWaitlistRequest(post('{oops'), memoryRepository(), silent);
    expect(response.status).toBe(400);
  });

  it('pretends to succeed for bots that fill the honeypot, without storing', async () => {
    const repo = memoryRepository();
    const response = await handleWaitlistRequest(
      post({ email: 'bot@spam.io', website: 'http://spam.io' }),
      repo,
      silent,
    );
    expect(response.status).toBe(200);
    expect(repo.signups).toEqual([]);
  });

  it('returns 500 and logs when storage fails', async () => {
    const logger = { error: vi.fn() };
    const failing = { add: () => Promise.reject(new Error('db down')) };

    const response = await handleWaitlistRequest(post({ email: 'a@b.co' }), failing, logger);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
