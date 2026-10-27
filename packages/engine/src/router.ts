import type {
  OcrConfidence,
  OcrEngine,
  OcrImage,
  OcrUsage,
  RecognizeOptions,
} from './engines/types.ts';
import { type ValidationResult, validateOutput } from './latex/validate.ts';

export type AttemptOutcome = 'accepted' | 'low-confidence' | 'invalid' | 'empty' | 'error';

export interface ConfidenceGate {
  readonly metric: keyof OcrConfidence;
  /** Outputs scoring below this fall through to the next step. */
  readonly threshold: number;
}

export interface RouterStep {
  readonly engine: OcrEngine;
  /**
   * Only accept this engine's output when it reports confidence at or above the threshold.
   * Outputs without a confidence score fail the gate.
   */
  readonly minConfidence?: ConfidenceGate;
}

export interface RouterAttempt {
  readonly engineId: string;
  readonly outcome: AttemptOutcome;
  readonly latencyMs: number;
  readonly latex?: string;
  readonly usage?: OcrUsage;
  readonly confidence?: OcrConfidence;
  readonly retries?: number;
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
      /**
       * True when no step was accepted and the router fell back to a valid output that failed
       * its confidence gate. Better than failing the snip outright.
       */
      readonly degraded: boolean;
    })
  | (RouterResultBase & { readonly status: 'failed' });

export interface OcrRouterOptions {
  readonly validate?: (latex: string) => ValidationResult;
  readonly now?: () => number;
}

/**
 * Tries steps in order and returns the first output that renders and passes the step's
 * confidence gate, so the user never receives LaTeX that does not render. Engine errors,
 * invalid output and low confidence all fall through to the next step; empty output ("no
 * math here") ends the attempt. If every step falls through, the most recent valid
 * low-confidence output is returned as degraded.
 */
export class OcrRouter {
  private readonly steps: readonly RouterStep[];
  private readonly validate: (latex: string) => ValidationResult;
  private readonly now: () => number;

  constructor(steps: readonly RouterStep[], options: OcrRouterOptions = {}) {
    if (steps.length === 0) throw new Error('OcrRouter requires at least one step');
    this.steps = steps;
    this.validate = options.validate ?? validateOutput;
    this.now = options.now ?? (() => performance.now());
  }

  get engineIds(): readonly string[] {
    return this.steps.map((step) => step.engine.id);
  }

  async recognize(image: OcrImage, options: RecognizeOptions = {}): Promise<RouterResult> {
    const startedAt = this.now();
    const attempts: RouterAttempt[] = [];
    let fallback: RouterAttempt | undefined;

    for (const { engine, minConfidence } of this.steps) {
      if (options.signal?.aborted) break;

      const attemptStartedAt = this.now();
      try {
        const output = await engine.recognize(image, options);
        if (output.latex.trim() === '') {
          // The prompt asks for empty output when there is no math. That is an answer, not
          // a failure, so a slower engine is not asked again.
          attempts.push({
            engineId: engine.id,
            outcome: 'empty',
            latencyMs: this.now() - attemptStartedAt,
            ...(output.usage ? { usage: output.usage } : {}),
          });
          break;
        }
        const validation = this.validate(output.latex);
        const attempt = {
          engineId: engine.id,
          latencyMs: this.now() - attemptStartedAt,
          latex: output.latex,
          ...(output.usage ? { usage: output.usage } : {}),
          ...(output.confidence ? { confidence: output.confidence } : {}),
          ...(output.retries ? { retries: output.retries } : {}),
        };

        if (!validation.ok) {
          attempts.push({ ...attempt, outcome: 'invalid', detail: validation.error });
          continue;
        }
        if (minConfidence && !passesGate(output.confidence, minConfidence)) {
          const score = output.confidence?.[minConfidence.metric];
          const lowConfidence: RouterAttempt = {
            ...attempt,
            outcome: 'low-confidence',
            detail: `${minConfidence.metric} confidence ${score?.toFixed(3) ?? 'missing'} < ${minConfidence.threshold}`,
          };
          attempts.push(lowConfidence);
          fallback = lowConfidence;
          continue;
        }

        attempts.push({ ...attempt, outcome: 'accepted' });
        return {
          status: 'ok',
          latex: output.latex,
          engineId: engine.id,
          degraded: false,
          ...summarize(attempts, this.now() - startedAt),
        };
      } catch (error) {
        attempts.push({
          engineId: engine.id,
          outcome: 'error',
          latencyMs: this.now() - attemptStartedAt,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = summarize(attempts, this.now() - startedAt);
    if (fallback?.latex !== undefined) {
      return {
        status: 'ok',
        latex: fallback.latex,
        engineId: fallback.engineId,
        degraded: true,
        ...summary,
      };
    }
    return { status: 'failed', ...summary };
  }
}

function passesGate(confidence: OcrConfidence | undefined, gate: ConfidenceGate): boolean {
  return confidence !== undefined && confidence[gate.metric] >= gate.threshold;
}

function summarize(attempts: readonly RouterAttempt[], latencyMs: number): RouterResultBase {
  const costUsd = attempts.reduce((sum, attempt) => sum + (attempt.usage?.costUsd ?? 0), 0);
  return { attempts, latencyMs, costUsd };
}
