import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

import type { KeyUsage } from './access.ts';

/** One row in `snips`: metadata only, never the image or the LaTeX. */
export interface SnipRecord {
  readonly keyId: number;
  readonly status: number;
  readonly engine?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly ms: number;
}

/** A key the app registers for itself (docs/beta-v1.md §15). */
export interface NewRegistration {
  readonly keyHash: string;
  readonly keyHint: string;
  readonly monthlyQuota: number;
  /** HMAC of the caller's IP address; the address itself is never stored. */
  readonly ipHash: string;
  /** Registrations allowed from one IP in 24 hours. */
  readonly maxPerIp: number;
}

export interface AccessStore {
  /** Null when no key has this hash. */
  usage(keyHash: string): Promise<KeyUsage | null>;
  record(snip: SnipRecord): Promise<void>;
  /** The new key's id, or null when this IP has used up its registrations for the day. */
  register(registration: NewRegistration): Promise<number | null>;
}

// Postgres counts and numerics arrive as strings over Neon's HTTP driver.
const usageRow = z.object({
  id: z.coerce.number(),
  monthly_quota: z.coerce.number(),
  revoked: z.boolean(),
  used_this_month: z.coerce.number(),
  requests_last_minute: z.coerce.number(),
  spent_today_usd: z.coerce.number(),
});

/** Neon's HTTP driver works on Cloudflare Workers and in Node without a connection pool. */
export function createNeonAccessStore(databaseUrl: string): AccessStore {
  const sql = neon(databaseUrl);
  return {
    async usage(keyHash) {
      // One round trip for every check. Month and day boundaries are UTC.
      const rows = await sql`
        SELECT
          k.id,
          k.monthly_quota,
          k.revoked_at IS NOT NULL AS revoked,
          (SELECT count(*) FROM snips s
            WHERE s.key_id = k.id AND s.status = 200
              AND s.created_at >= date_trunc('month', now(), 'UTC')) AS used_this_month,
          (SELECT count(*) FROM snips s
            WHERE s.key_id = k.id
              AND s.created_at >= now() - interval '1 minute') AS requests_last_minute,
          (SELECT coalesce(sum(s.cost_usd), 0) FROM snips s
            WHERE s.created_at >= date_trunc('day', now(), 'UTC')) AS spent_today_usd
        FROM access_keys k
        WHERE k.key_hash = ${keyHash}
      `;
      const row = rows[0];
      if (row === undefined) return null;
      const parsed = usageRow.parse(row);
      return {
        keyId: parsed.id,
        monthlyQuota: parsed.monthly_quota,
        revoked: parsed.revoked,
        usedThisMonth: parsed.used_this_month,
        requestsLastMinute: parsed.requests_last_minute,
        spentTodayUsd: parsed.spent_today_usd,
      };
    },

    async record(snip) {
      await sql`
        INSERT INTO snips (key_id, status, engine, input_tokens, output_tokens, cost_usd, ms)
        VALUES (${snip.keyId}, ${snip.status}, ${snip.engine ?? null}, ${snip.inputTokens},
                ${snip.outputTokens}, ${snip.costUsd}, ${snip.ms})
      `;
    },

    async register(registration) {
      // One statement: count this IP's recent registrations, insert the key only if under the
      // limit, log the registration, and drop log rows older than a day. Two requests at the
      // same instant can both pass the count; one extra key is acceptable.
      const rows = await sql`
        WITH pruned AS (
          DELETE FROM registrations WHERE created_at < now() - interval '1 day'
        ),
        recent AS (
          SELECT count(*) AS n FROM registrations
          WHERE ip_hash = ${registration.ipHash}
            AND created_at >= now() - interval '1 day'
        ),
        new_key AS (
          INSERT INTO access_keys (key_hash, key_hint, monthly_quota, source)
          SELECT ${registration.keyHash}, ${registration.keyHint}, ${registration.monthlyQuota},
                 'app'
          WHERE (SELECT n FROM recent) < ${registration.maxPerIp}
          RETURNING id
        ),
        logged AS (
          INSERT INTO registrations (ip_hash) SELECT ${registration.ipHash} FROM new_key
        )
        SELECT id FROM new_key
      `;
      const row = rows[0];
      return row === undefined ? null : z.coerce.number().parse(row.id);
    },
  };
}
