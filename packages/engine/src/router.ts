import type { OcrEngine, OcrImage, OcrUsage, RecognizeOptions } from './engines/types.ts';
import { type ValidationResult, validateLatex } from './latex/validate.ts';

export type AttemptOutcome = 'accepted' | 'invalid' | 'error';

export interface RouterAttempt {
  readonly engineId: string;
  readonly outcome: AttemptOutcome;
  readonly latencyMs: number;
  readonly latex?: string;
  readonly usage?: OcrUsage;
  /** Validation or engine error message when the attempt was not accepted. */
  readonly detail?: string;
}

interface RouterResultBase {
  readonly attempts: readonly RouterAttempt[];
  readonly latencyMs: number;
  readonly costUsd: number;
}

export type RouterResult =
  | (RouterResultBase & {
      readonly status: 'ok';
      readonly latex: string;
      readonly engineId: string;
    })
  | (RouterResultBase & { readonly status: 'failed' });

export interface OcrRouterOptions {
  readonly validate?: (latex: string) => ValidationResult;
  readonly now?: () => number;
}

/**
 * Tries engines in order and returns the first output that passes validation, so the user
 * never receives LaTeX that does not render. Engine errors and invalid output both fall
 * through to the next engine.
 */
export class OcrRouter {
  private readonly engines: readonly OcrEngine[];
  private readonly validate: (latex: string) => ValidationResult;
  private readonly now: () => number;

  constructor(engines: readonly OcrEngine[], options: OcrRouterOptions = {}) {
    if (engines.length === 0) throw new Error('OcrRouter requires at least one engine');
    this.engines = engines;
    this.validate = options.validate ?? validateLatex;
    this.now = options.now ?? (() => performance.now());
  }

  get engineIds(): readonly string[] {
    return this.engines.map((engine) => engine.id);
  }

  async recognize(image: OcrImage, options: RecognizeOptions = {}): Promise<RouterResult> {
    const startedAt = this.now();
    const attempts: RouterAttempt[] = [];

    for (const engine of this.engines) {
      if (options.signal?.aborted) break;

      const attemptStartedAt = this.now();
      try {
        const output = await engine.recognize(image, options);
        const validation = this.validate(output.latex);
        const attempt = {
          engineId: engine.id,
          latencyMs: this.now() - attemptStartedAt,
          latex: output.latex,
          ...(output.usage ? { usage: output.usage } : {}),
        };

        if (validation.ok) {
          attempts.push({ ...attempt, outcome: 'accepted' });
          return {
            status: 'ok',
            latex: output.latex,
            engineId: engine.id,
            ...summarize(attempts, this.now() - startedAt),
          };
        }
        attempts.push({ ...attempt, outcome: 'invalid', detail: validation.error });
      } catch (error) {
        attempts.push({
          engineId: engine.id,
          outcome: 'error',
          latencyMs: this.now() - attemptStartedAt,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { status: 'failed', ...summarize(attempts, this.now() - startedAt) };
  }
}

function summarize(attempts: readonly RouterAttempt[], latencyMs: number): RouterResultBase {
  const costUsd = attempts.reduce((sum, attempt) => sum + (attempt.usage?.costUsd ?? 0), 0);
  return { attempts, latencyMs, costUsd };
}
