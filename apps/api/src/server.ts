import path from 'node:path';

import { createApp } from './app.ts';
import { ownerKeyAuthorizer } from './auth.ts';
import { loadConfig } from './config.ts';
import { createJsonLogger } from './logger.ts';
import { ENGINE_CHAIN, createGeminiRecognizer } from './recognizer.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

const config = loadConfig(path.join(REPO_ROOT, '.env'));
const logger = createJsonLogger();

const server = createApp({
  recognizer: createGeminiRecognizer(config.GEMINI_API_KEY),
  logger,
  ...(config.SNIP_OWNER_KEY ? { authorize: ownerKeyAuthorizer(config.SNIP_OWNER_KEY) } : {}),
}).listen(config.PORT, config.HOST, () => {
  logger.info('listening', {
    url: `http://${config.HOST}:${config.PORT}`,
    engines: ENGINE_CHAIN,
    auth: config.SNIP_OWNER_KEY ? 'owner key' : 'none',
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
  });
}
