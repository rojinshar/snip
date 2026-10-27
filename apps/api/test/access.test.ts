import { describe, expect, it } from 'vitest';

import { type KeyUsage, decideAccess, quotaResetsAt } from '../src/access.ts';

const limits = { requestsPerMinute: 10, dailySpendCapUsd: 2 };
const usage = (overrides: Partial<KeyUsage> = {}): KeyUsage => ({
  keyId: 1,
  monthlyQuota: 200,
  revoked: false,
  usedThisMonth: 0,
  requestsLastMinute: 0,
  spentTodayUsd: 0,
  ...overrides,
});

describe('decideAccess', () => {
  it('allows a valid key within every limit', () => {
    expect(decideAccess(usage({ usedThisMonth: 199, requestsLastMinute: 9 }), limits)).toEqual({
      ok: true,
      keyId: 1,
    });
  });

  it('rejects unknown and revoked keys', () => {
    expect(decideAccess(null, limits)).toEqual({ ok: false, error: 'invalid_key' });
    expect(decideAccess(usage({ revoked: true }), limits)).toEqual({
      ok: false,
      error: 'invalid_key',
    });
  });

  it('enforces each limit at its boundary', () => {
    expect(decideAccess(usage({ usedThisMonth: 200 }), limits)).toMatchObject({
      error: 'quota_exceeded',
    });
    expect(decideAccess(usage({ requestsLastMinute: 10 }), limits)).toMatchObject({
      error: 'rate_limited',
    });
    expect(decideAccess(usage({ spentTodayUsd: 2 }), limits)).toMatchObject({
      error: 'capacity',
    });
  });

  it('a zero quota blocks the key without revoking it', () => {
    expect(decideAccess(usage({ monthlyQuota: 0 }), limits)).toMatchObject({
      error: 'quota_exceeded',
    });
  });

  it('reports the most specific reason first', () => {
    const everything = usage({ usedThisMonth: 200, requestsLastMinute: 10, spentTodayUsd: 5 });
    expect(decideAccess(everything, limits)).toMatchObject({ error: 'quota_exceeded' });
    expect(decideAccess({ ...everything, usedThisMonth: 0 }, limits)).toMatchObject({
      error: 'rate_limited',
    });
  });
});

describe('quotaResetsAt', () => {
  it('is midnight UTC on the first of next month', () => {
    expect(quotaResetsAt(new Date('2026-10-26T12:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(quotaResetsAt(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});
