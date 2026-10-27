import { describe, expect, it } from 'vitest';

import { bearerToken } from '../src/auth.ts';

describe('bearerToken', () => {
  it('extracts the token from a bearer header', () => {
    expect(bearerToken('Bearer snip_abc')).toBe('snip_abc');
    expect(bearerToken('bearer snip_abc ')).toBe('snip_abc');
  });

  it('returns null for missing or malformed headers', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Basic dXNlcg==')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
  });
});
