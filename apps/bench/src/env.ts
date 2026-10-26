import { existsSync } from 'node:fs';

import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const envSchema = z.object({
  GEMINI_API_KEY: optionalSecret,
  MATHPIX_APP_ID: optionalSecret,
  MATHPIX_APP_KEY: optionalSecret,
});

export type BenchEnv = z.infer<typeof envSchema>;

/** Loads `envFile` into process.env when it exists, then validates the variables we use. */
export function loadEnv(envFile: string): BenchEnv {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return envSchema.parse(process.env);
}
