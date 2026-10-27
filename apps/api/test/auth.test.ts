import { describe, expect, it } from 'vitest';

import { bearerToken, ownerKeyAuthorizer } from '../src/auth.ts';

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

describe('ownerKeyAuthorizer', () => {
  const authorize = ownerKeyAuthorizer('snip_owner');

  it('accepts only the exact key', () => {
    expect(authorize('snip_owner')).toBe(true);
    expect(authorize('snip_owner2')).toBe(false);
    expect(authorize('')).toBe(false);
    expect(authorize(null)).toBe(false);
  });
});
