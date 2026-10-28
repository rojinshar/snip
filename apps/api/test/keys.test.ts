import { describe, expect, it } from 'vitest';

import { accessKeyHint, generateAccessKey, hashAccessKey, hashIp } from '../src/keys.ts';

describe('generateAccessKey', () => {
  it('makes snip_ plus 26 base32 characters, matching what the app accepts', () => {
    for (let i = 0; i < 50; i++) expect(generateAccessKey()).toMatch(/^snip_[a-z2-7]{26}$/);
  });

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 1000 }, generateAccessKey));
    expect(keys.size).toBe(1000);
  });
});

describe('hashAccessKey', () => {
  it('is the hex SHA-256 the database stores', () => {
    expect(hashAccessKey('snip_abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessKey('snip_abc')).toBe(hashAccessKey('snip_abc'));
    expect(hashAccessKey('snip_abc')).not.toBe(hashAccessKey('snip_abd'));
  });
});

describe('accessKeyHint', () => {
  it('is the last four characters', () => {
    expect(accessKeyHint('snip_abcdefghijklmnopqrstuvwx23')).toBe('wx23');
  });
});

describe('hashIp', () => {
  it('is a hex HMAC that depends on the secret, so it cannot be reversed without it', () => {
    const hash = hashIp('203.0.113.7', 'secret-one');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp('203.0.113.7', 'secret-one')).toBe(hash);
    expect(hashIp('203.0.113.7', 'secret-two')).not.toBe(hash);
    expect(hashIp('203.0.113.8', 'secret-one')).not.toBe(hash);
  });
});
