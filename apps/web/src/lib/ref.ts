/** Campaign tag sent when the visitor arrived without `?ref=`. */
export const DIRECT_REF = 'direct';

const STORAGE_KEY = 'snip:ref';

export type RefStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Remembers the campaign tag (`?ref=reddit-latex`) for the rest of the session, so a visitor
 * who reloads or follows an in-page link is still attributed to the post that brought them.
 * Storage can be missing or throw (private windows, blocked site data); the in-memory copy
 * covers the current page in that case.
 */
export class RefTracker {
  private memory: string | undefined;

  constructor(private readonly storage: () => RefStorage | undefined) {}

  /** Stores `ref` from the query string, if present. A newer tag replaces an older one. */
  capture(search: string): void {
    const ref = new URLSearchParams(search).get('ref')?.trim();
    if (!ref) return;
    this.memory = ref;
    try {
      this.storage()?.setItem(STORAGE_KEY, ref);
    } catch {
      // Keep the in-memory copy.
    }
  }

  /** The tag to send with a sign-up: captured, else stored this session, else `direct`. */
  current(): string {
    if (this.memory) return this.memory;
    try {
      return this.storage()?.getItem(STORAGE_KEY) ?? DIRECT_REF;
    } catch {
      return DIRECT_REF;
    }
  }
}

export const refTracker = new RefTracker(() =>
  typeof window === 'undefined' ? undefined : window.sessionStorage,
);
