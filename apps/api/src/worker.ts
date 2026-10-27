// Cloudflare Workers entry point (docs/beta-v1.md §3). The Express app runs unchanged
// through Workers' Node.js HTTP compatibility; only configuration and logging differ from
// server.ts.
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { z } from 'zod';

import { createApp } from './app.ts';
import { ownerKeyAuthorizer } from './auth.ts';
import { createJsonLogger } from './logger.ts';
import { createGeminiRecognizer } from './recognizer.ts';

const PORT = 8080;

const workerEnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY secret is required'),
  // Unlike local development, the public API never runs without a key.
  SNIP_OWNER_KEY: z.string().trim().min(1, 'SNIP_OWNER_KEY secret is required'),
});

const config = workerEnvSchema.parse(env);

createApp({
  recognizer: createGeminiRecognizer(config.GEMINI_API_KEY),
  // Workers Logs indexes JSON written to the console.
  logger: createJsonLogger((line) => {
    console.log(line);
  }),
  authorize: ownerKeyAuthorizer(config.SNIP_OWNER_KEY),
}).listen(PORT);

export default httpServerHandler({ port: PORT });
