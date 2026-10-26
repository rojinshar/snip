import {
  GEMINI_PRESETS,
  GeminiEngine,
  type GeminiPresetName,
  MathpixEngine,
  type OcrEngine,
  type OcrConfidence,
  type OcrImage,
  OcrRouter,
  type ConfidenceGate,
  UnimernetEngine,
} from '@snip/engine';

import type { BenchEnv } from './env.ts';
import { RateLimitedEngine, RateLimiter } from './rate-limit.ts';

const GEMINI_ENGINE_NAMES = Object.keys(GEMINI_PRESETS) as GeminiPresetName[];

export const ENGINE_NAMES = [
  ...GEMINI_ENGINE_NAMES,
  'router',
  'unimernet-tiny',
  'hybrid',
  'mathpix',
] as const;
export type EngineName = (typeof ENGINE_NAMES)[number];

export interface RunOutput {
  /** Final LaTeX, or null if the engine produced nothing usable. */
  readonly latex: string | null;
  readonly costUsd: number;
  /** Engine that produced `latex`; differs from the runner name for the router. */
  readonly servedBy?: string;
  /** Confidence of the engine that produced `latex`, when it reports one. */
  readonly confidence?: OcrConfidence;
  readonly error?: string;
}

/** Uniform wrapper so the benchmark can treat single engines and the router alike. */
export interface BenchRunner {
  readonly name: EngineName;
  run(image: OcrImage): Promise<RunOutput>;
}

export class EngineConfigError extends Error {
  override readonly name = 'EngineConfigError';
}

export function isEngineName(value: string): value is EngineName {
  return (ENGINE_NAMES as readonly string[]).includes(value);
}

export interface RunnerOptions {
  /** Requests per minute allowed per Gemini model (free tier: 15). Unlimited if omitted. */
  readonly geminiRpm?: number;
  /** Confidence gate for UniMERNet in the hybrid router. */
  readonly hybridGate: ConfidenceGate;
}

/**
 * Chosen from the routing simulation on the seed-42 UniMER sample: sends ~10% of snips to
 * Gemini for most of the accuracy gain. Re-tune on real Snip traffic.
 */
export const DEFAULT_HYBRID_GATE: ConfidenceGate = { metric: 'mean', threshold: 0.98 };

/** Gemini-only plan: cheap model first, strongest Flash on failure. */
const ROUTER_CHAIN: readonly GeminiPresetName[] = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

export function createRunners(
  names: readonly EngineName[],
  env: BenchEnv,
  options: RunnerOptions,
): BenchRunner[] {
  // One limiter per Gemini model, shared by every runner that uses it, since provider
  // quotas are per model.
  const limiters = new Map<GeminiPresetName, RateLimiter>();
  const gemini = (preset: GeminiPresetName): OcrEngine => {
    const engine = createGemini(preset, env);
    if (options.geminiRpm === undefined) return engine;
    let limiter = limiters.get(preset);
    if (!limiter) {
      limiter = new RateLimiter(options.geminiRpm);
      limiters.set(preset, limiter);
    }
    return new RateLimitedEngine(engine, limiter);
  };
  const unimernet = () => new UnimernetEngine({ baseUrl: env.UNIMERNET_URL });

  return names.map((name): BenchRunner => {
    switch (name) {
      case 'mathpix':
        return singleEngineRunner(name, createMathpix(env));
      case 'unimernet-tiny':
        return singleEngineRunner(name, unimernet());
      case 'router':
        return routerRunner(name, new OcrRouter(ROUTER_CHAIN.map((p) => ({ engine: gemini(p) }))));
      case 'hybrid':
        // Fast, free UniMERNet first; Gemini only when UniMERNet is unsure or fails.
        return routerRunner(
          name,
          new OcrRouter([
            { engine: unimernet(), minConfidence: options.hybridGate },
            { engine: gemini('gemini-3.5-flash-lite') },
          ]),
        );
      default:
        return singleEngineRunner(name, gemini(name));
    }
  });
}

function createGemini(preset: GeminiPresetName, env: BenchEnv): GeminiEngine {
  if (env.GEMINI_API_KEY === undefined) {
    throw new EngineConfigError(`${preset} needs GEMINI_API_KEY in .env`);
  }
  return new GeminiEngine({ id: preset, ...GEMINI_PRESETS[preset], apiKey: env.GEMINI_API_KEY });
}

function createMathpix(env: BenchEnv): MathpixEngine {
  if (env.MATHPIX_APP_ID === undefined || env.MATHPIX_APP_KEY === undefined) {
    throw new EngineConfigError('mathpix needs MATHPIX_APP_ID and MATHPIX_APP_KEY in .env');
  }
  return new MathpixEngine({ appId: env.MATHPIX_APP_ID, appKey: env.MATHPIX_APP_KEY });
}

function singleEngineRunner(name: EngineName, engine: OcrEngine): BenchRunner {
  return {
    name,
    async run(image) {
      try {
        const output = await engine.recognize(image);
        return {
          latex: output.latex,
          costUsd: output.usage?.costUsd ?? 0,
          servedBy: engine.id,
          ...(output.confidence ? { confidence: output.confidence } : {}),
        };
      } catch (error) {
        return { latex: null, costUsd: 0, error: errorMessage(error) };
      }
    },
  };
}

function routerRunner(name: EngineName, router: OcrRouter): BenchRunner {
  return {
    name,
    async run(image) {
      const result = await router.recognize(image);
      if (result.status === 'ok') {
        const served = result.attempts.findLast((a) => a.engineId === result.engineId);
        return {
          latex: result.latex,
          costUsd: result.costUsd,
          servedBy: result.degraded ? `${result.engineId} (degraded)` : result.engineId,
          ...(served?.confidence ? { confidence: served.confidence } : {}),
        };
      }
      // Score the last thing the router saw, so failures still show up in accuracy.
      const lastOutput = result.attempts.findLast((attempt) => attempt.latex !== undefined);
      const details = result.attempts.map((a) => `${a.engineId}: ${a.detail ?? a.outcome}`);
      return {
        latex: lastOutput?.latex ?? null,
        costUsd: result.costUsd,
        error: `all engines failed (${details.join('; ')})`,
        ...(lastOutput ? { servedBy: lastOutput.engineId } : {}),
      };
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
