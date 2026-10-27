import type { AttemptOutcome, OcrImage, OcrRouter, RouterResult } from '@snip/engine';

export type RecognizeErrorCode = 'no_math_found' | 'upstream_failed';

/** One engine call, for the request log. Never contains the LaTeX. */
export interface AttemptSummary {
  readonly engine: string;
  readonly outcome: AttemptOutcome;
  readonly ms: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly retries?: number;
}

export type RecognizeResult = {
  readonly attempts: readonly AttemptSummary[];
  /** Total provider cost across every attempt. */
  readonly costUsd: number;
} & (
  | { readonly ok: true; readonly latex: string; readonly engine: string }
  | { readonly ok: false; readonly error: RecognizeErrorCode; readonly detail: string }
);

/** Turns an image into validated LaTeX. The HTTP layer depends on this, not on engines. */
export interface Recognizer {
  recognize(image: OcrImage): Promise<RecognizeResult>;
}

export function createRouterRecognizer(router: Pick<OcrRouter, 'recognize'>): Recognizer {
  return {
    async recognize(image) {
      return toRecognizeResult(await router.recognize(image));
    },
  };
}

/**
 * Maps a router outcome to the API contract. If every engine answered but none produced
 * renderable LaTeX, the image most likely has no math in it (422). If any engine errored,
 * the failure is ours or the provider's (502), so the client should retry.
 */
export function toRecognizeResult(result: RouterResult): RecognizeResult {
  const attempts = result.attempts.map((a) => ({
    engine: a.engineId,
    outcome: a.outcome,
    ms: Math.round(a.latencyMs),
    ...(a.usage ? { inputTokens: a.usage.inputTokens, outputTokens: a.usage.outputTokens } : {}),
    ...(a.retries ? { retries: a.retries } : {}),
  }));
  if (result.status === 'ok') {
    return {
      ok: true,
      latex: result.latex,
      engine: result.engineId,
      attempts,
      costUsd: result.costUsd,
    };
  }
  const detail = result.attempts.map((a) => `${a.engineId}: ${a.detail ?? a.outcome}`).join('; ');
  const anyEngineErrored = result.attempts.some((attempt) => attempt.outcome === 'error');
  return {
    ok: false,
    error: anyEngineErrored ? 'upstream_failed' : 'no_math_found',
    detail,
    attempts,
    costUsd: result.costUsd,
  };
}
