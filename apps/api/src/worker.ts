// Cloudflare Workers entry point (docs/beta-v1.md §3). The Express app runs unchanged
// through Workers' Node.js HTTP compatibility; only configuration and logging differ from
// server.ts.
import { httpServerHandler } from 'cloudflare:node';
import { env, waitUntil } from 'cloudflare:workers';
import { z } from 'zod';

import { createApp } from './app.ts';
import { accessLimitsSchema, registrationConfig } from './config.ts';
import { createNeonAccessStore } from './access-store.ts';
import { createJsonLogger } from './logger.ts';
import { createGeminiRecognizer } from './recognizer.ts';

const PORT = 8080;

const workerEnvSchema = z
  .object({
    GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY secret is required'),
    // Unlike local development, the public API always checks access keys.
    DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL secret is required'),
  })
  .extend(accessLimitsSchema.shape);

const config = workerEnvSchema.parse(env);
const registration = registrationConfig(config);
if (config.REGISTRATION_OPEN && !registration) {
  console.error(
    'REGISTRATION_OPEN is set but REGISTRATION_SECRET is missing; registration is closed',
  );
}

createApp({
  recognizer: createGeminiRecognizer(config.GEMINI_API_KEY),
  // Workers Logs indexes JSON written to the console.
  logger: createJsonLogger((line) => {
    console.log(line);
  }),
  access: {
    store: createNeonAccessStore(config.DATABASE_URL),
    limits: {
      requestsPerMinute: config.RATE_LIMIT_PER_MINUTE,
      dailySpendCapUsd: config.DAILY_SPEND_CAP_USD,
    },
    ...(registration ? { registration } : {}),
    // Write the usage row after responding, without the Worker ending first.
    defer: waitUntil,
  },
}).listen(PORT);

export default httpServerHandler({ port: PORT });
