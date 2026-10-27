/**
 * Applies migrations/*.sql in filename order, once each, recording them in
 * schema_migrations. Each file runs in one transaction. The database is shared by the
 * website (waitlist) and the API (access keys, snips).
 *
 * Usage: npm run db:migrate   (reads DATABASE_URL from the environment or the root .env)
 *
 * Statements are split on semicolons at line ends, so keep migrations to plain DDL/DML
 * (no functions or DO blocks with inner semicolons).
 */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { neon } from '@neondatabase/serverless';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const MIGRATIONS_DIR = path.join(PACKAGE_ROOT, 'migrations');

export function splitStatements(sqlText: string): string[] {
  return sqlText
    .split(/;\s*$/m)
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((statement) => statement !== '');
}

async function main(): Promise<void> {
  const envFile = path.join(REPO_ROOT, '.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (environment or root .env)');

  const sql = neon(databaseUrl);
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const applied = new Set(
    (await sql`SELECT name FROM schema_migrations`).map((row) => String(row.name)),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip    ${file}`);
      continue;
    }
    const statements = splitStatements(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
    await sql.transaction([
      ...statements.map((statement) => sql.query(statement)),
      sql`INSERT INTO schema_migrations (name) VALUES (${file})`,
    ]);
    console.log(`applied ${file} (${statements.length} statements)`);
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
