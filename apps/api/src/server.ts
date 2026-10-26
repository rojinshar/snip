import path from 'node:path';

import { GEMINI_PRESETS, GeminiEngine, type GeminiPresetName, OcrRouter } from '@snip/engine';

import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createJsonLogger } from './logger.ts';
import { createRouterRecognizer } from './recognize.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/** Flash-Lite first; 3.8 Flash only when Flash-Lite fails (docs/desktop-v0.md §13). */
const ENGINE_CHAIN: readonly GeminiPresetName[] = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

const config = loadConfig(path.join(REPO_ROOT, '.env'));
const logger = createJsonLogger();

const router = new OcrRouter(
  ENGINE_CHAIN.map((preset) => ({
    engine: new GeminiEngine({
      id: preset,
      ...GEMINI_PRESETS[preset],
      apiKey: config.GEMINI_API_KEY,
      // Gemini sends this as a server deadline and rejects anything under 10 s.
      timeoutMs: 10_000,
      retryPolicy: { maxAttempts: 2, baseDelayMs: 300, maxDelayMs: 1_000 },
    }),
  })),
);

const server = createApp({ recognizer: createRouterRecognizer(router), logger }).listen(
  config.PORT,
  config.HOST,
  () => {
    logger.info('listening', {
      url: `http://${config.HOST}:${config.PORT}`,
      engines: ENGINE_CHAIN,
    });
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
  });
}
