import { describe, expect, it } from 'vitest';

import { DIRECT_REF, RefTracker, type RefStorage } from '../src/lib/ref';

function memoryStorage(): RefStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const throwing: RefStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('SecurityError');
  },
};

describe('RefTracker', () => {
  it('sends direct when the visitor arrived without a ref', () => {
    const tracker = new RefTracker(memoryStorage);
    tracker.capture('');
    expect(tracker.current()).toBe(DIRECT_REF);
  });

  it('returns the ref from the query string', () => {
    const tracker = new RefTracker(memoryStorage);
    tracker.capture('?ref=reddit-latex&utm=x');
    expect(tracker.current()).toBe('reddit-latex');
  });

  it('keeps the ref for the session after the query string is gone', () => {
    const storage = memoryStorage();
    new RefTracker(() => storage).capture('?ref=reddit-latex');

    const afterReload = new RefTracker(() => storage);
    afterReload.capture('');

    expect(afterReload.current()).toBe('reddit-latex');
  });

  it('lets a newer ref replace an older one', () => {
    const storage = memoryStorage();
    new RefTracker(() => storage).capture('?ref=reddit-latex');

    const later = new RefTracker(() => storage);
    later.capture('?ref=discord');

    expect(later.current()).toBe('discord');
  });

  it('falls back to memory when storage throws', () => {
    const tracker = new RefTracker(() => throwing);
    tracker.capture('?ref=reddit-latex');
    expect(tracker.current()).toBe('reddit-latex');
    expect(new RefTracker(() => throwing).current()).toBe(DIRECT_REF);
  });

  it('works without storage at all', () => {
    const tracker = new RefTracker(() => undefined);
    expect(tracker.current()).toBe(DIRECT_REF);
    tracker.capture('?ref=x');
    expect(tracker.current()).toBe('x');
  });
});
