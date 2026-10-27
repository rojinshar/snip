import { existsSync } from 'node:fs';

import { z } from 'zod';

/** Limits shared by the Node server and the Worker (docs/beta-v1.md §5). */
export const accessLimitsSchema = z.object({
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(2),
});

const configSchema = z
  .object({
    GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is required'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8790),
    /** Loopback by default: the Node server is for local development. */
    HOST: z.string().default('127.0.0.1'),
    /**
     * Off by default, so local runs never write usage rows to the shared database. Turn it on
     * to test keys and quotas locally.
     */
    REQUIRE_ACCESS_KEYS: z.stringbool().default(false),
    DATABASE_URL: z.string().trim().min(1).optional(),
  })
  .extend(accessLimitsSchema.shape)
  .refine((config) => !config.REQUIRE_ACCESS_KEYS || config.DATABASE_URL !== undefined, {
    message: 'REQUIRE_ACCESS_KEYS needs DATABASE_URL',
    path: ['DATABASE_URL'],
  });

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(envFile: string): ApiConfig {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid API configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
