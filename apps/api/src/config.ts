import { existsSync } from 'node:fs';

import { z } from 'zod';

const configSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is required'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8790),
  /** Loopback by default: v0 runs on the developer's machine only. */
  HOST: z.string().default('127.0.0.1'),
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
