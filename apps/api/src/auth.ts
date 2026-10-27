import { createHash, timingSafeEqual } from 'node:crypto';

/** Decides whether a request's bearer token may use the API. */
export type Authorizer = (token: string | null) => boolean | Promise<boolean>;

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

/**
 * Accepts exactly one key (beta milestone B1, before per-tester keys). Compares digests in
 * constant time so response timing reveals nothing about the key.
 */
export function ownerKeyAuthorizer(ownerKey: string): Authorizer {
  const expected = digest(ownerKey);
  return (token) => token !== null && timingSafeEqual(digest(token), expected);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
