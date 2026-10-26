import { neon } from '@neondatabase/serverless';

import type { WaitlistRepository } from './waitlist';

/** Neon's HTTP driver works on Cloudflare Workers and in Node without a connection pool. */
export function createNeonWaitlistRepository(databaseUrl: string): WaitlistRepository {
  const sql = neon(databaseUrl);
  return {
    async add({ email, source }) {
      await sql`
        INSERT INTO waitlist_signups (email, source)
        VALUES (${email}, ${source ?? null})
        ON CONFLICT (email) DO NOTHING
      `;
    },
  };
}
