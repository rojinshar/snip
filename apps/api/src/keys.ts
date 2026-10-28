import { createHash, createHmac, randomInt } from 'node:crypto';

const PREFIX = 'snip_';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'; // RFC 4648 base32, lower case
const RANDOM_LENGTH = 26; // 130 bits

/** A new access key: `snip_` plus 26 random base32 characters (docs/beta-v1.md §4). */
export function generateAccessKey(): string {
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i++) random += ALPHABET.charAt(randomInt(ALPHABET.length));
  return PREFIX + random;
}

/** What the database stores instead of the key: its hex SHA-256. */
export function hashAccessKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** The last four characters, enough to tell keys apart in `keys:list`. */
export function accessKeyHint(key: string): string {
  return key.slice(-4);
}

/**
 * What `registrations` stores instead of the IP address: its hex HMAC-SHA-256. Keyed with a
 * secret, because a plain hash of an IPv4 address is undone by trying all 2^32 of them.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}
