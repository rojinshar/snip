import path from 'node:path';

import { type AccessControl, createApp } from './app.ts';
import { createNeonAccessStore } from './access-store.ts';
import { loadConfig } from './config.ts';
import { createJsonLogger } from './logger.ts';
import { ENGINE_CHAIN, createGeminiRecognizer } from './recognizer.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

const config = loadConfig(path.join(REPO_ROOT, '.env'));
const logger = createJsonLogger();

const access: AccessControl | undefined =
  config.REQUIRE_ACCESS_KEYS && config.DATABASE_URL
    ? {
        store: createNeonAccessStore(config.DATABASE_URL),
        limits: {
          requestsPerMinute: config.RATE_LIMIT_PER_MINUTE,
          dailySpendCapUsd: config.DAILY_SPEND_CAP_USD,
        },
      }
    : undefined;

const server = createApp({
  recognizer: createGeminiRecognizer(config.GEMINI_API_KEY),
  logger,
  ...(access ? { access } : {}),
}).listen(config.PORT, config.HOST, () => {
  logger.info('listening', {
    url: `http://${config.HOST}:${config.PORT}`,
    engines: ENGINE_CHAIN,
    accessKeys: access ? 'required' : 'off',
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
  });
}
