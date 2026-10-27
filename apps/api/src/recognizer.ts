import { GEMINI_PRESETS, GeminiEngine, type GeminiPresetName, OcrRouter } from '@snip/engine';

import { type Recognizer, createRouterRecognizer } from './recognize.ts';

/** Flash-Lite first; 3.8 Flash only when Flash-Lite fails (docs/desktop-v0.md §13). */
export const ENGINE_CHAIN: readonly GeminiPresetName[] = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
];

/** The production recognizer, shared by the Node server and the Worker. */
export function createGeminiRecognizer(apiKey: string): Recognizer {
  const router = new OcrRouter(
    ENGINE_CHAIN.map((preset) => ({
      engine: new GeminiEngine({
        id: preset,
        ...GEMINI_PRESETS[preset],
        apiKey,
        // Gemini sends this as a server deadline and rejects anything under 10 s.
        timeoutMs: 10_000,
        retryPolicy: { maxAttempts: 2, baseDelayMs: 300, maxDelayMs: 1_000 },
      }),
    })),
  );
  return createRouterRecognizer(router);
}
