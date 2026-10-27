/**
 * Manages beta access keys (docs/beta-v1.md §4). Run from the repo root:
 *
 *   npm run keys -- create --email tester@uni.edu [--quota 200]
 *   npm run keys -- list
 *   npm run keys -- quota --id 3 --quota 500
 *   npm run keys -- revoke --id 3
 *
 * Reads DATABASE_URL from the environment or the root .env. A new key is printed once and
 * only its hash is stored, so copy it when it is created.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

import { accessKeyHint, generateAccessKey, hashAccessKey } from '../src/keys.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_QUOTA = 200;

const email = z.email().transform((value) => value.toLowerCase());
const quota = z.coerce.number().int().min(0);
const id = z.coerce.number().int().positive();

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { email: { type: 'string' }, quota: { type: 'string' }, id: { type: 'string' } },
  });

  const envFile = path.join(REPO_ROOT, '.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (environment or root .env)');
  const sql = neon(databaseUrl);

  switch (positionals[0]) {
    case 'create': {
      const key = generateAccessKey();
      const rows = await sql`
        INSERT INTO access_keys (key_hash, key_hint, email, monthly_quota)
        VALUES (${hashAccessKey(key)}, ${accessKeyHint(key)}, ${email.parse(values.email)},
                ${quota.parse(values.quota ?? DEFAULT_QUOTA)})
        RETURNING id
      `;
      console.log(
        `Created key ${String(rows[0]?.id)}. Send it to the tester; it is not shown again:\n`,
      );
      console.log(`  ${key}\n`);
      return;
    }
    case 'list': {
      const rows = await sql`
        SELECT k.id, k.key_hint, k.email, k.monthly_quota,
               (SELECT count(*) FROM snips s
                 WHERE s.key_id = k.id AND s.status = 200
                   AND s.created_at >= date_trunc('month', now(), 'UTC')) AS used_this_month,
               to_char(k.created_at, 'YYYY-MM-DD') AS created,
               to_char(k.revoked_at, 'YYYY-MM-DD') AS revoked
        FROM access_keys k
        ORDER BY k.id
      `;
      console.table(rows);
      return;
    }
    case 'quota': {
      const rows = await sql`
        UPDATE access_keys SET monthly_quota = ${quota.parse(values.quota)}
        WHERE id = ${id.parse(values.id)} RETURNING id, email, monthly_quota
      `;
      console.table(rows);
      if (rows.length === 0) process.exitCode = 1;
      return;
    }
    case 'revoke': {
      const rows = await sql`
        UPDATE access_keys SET revoked_at = now()
        WHERE id = ${id.parse(values.id)} AND revoked_at IS NULL RETURNING id, email
      `;
      console.log(
        rows.length === 1 ? `Revoked key ${values.id ?? ''}.` : 'No active key with that id.',
      );
      if (rows.length === 0) process.exitCode = 1;
      return;
    }
    default:
      console.error(
        'Usage: npm run keys -- create --email <email> [--quota 200] | list | quota --id <id> --quota <n> | revoke --id <id>',
      );
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
