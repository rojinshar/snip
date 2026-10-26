import {
  GEMINI_PRESETS,
  GeminiEngine,
  type GeminiPresetName,
  MathpixEngine,
  type OcrEngine,
  type OcrImage,
  OcrRouter,
  UnimernetEngine,
} from '@snip/engine';

import type { BenchEnv } from './env.ts';

const GEMINI_ENGINE_NAMES = Object.keys(GEMINI_PRESETS) as GeminiPresetName[];

export const ENGINE_NAMES = [
  ...GEMINI_ENGINE_NAMES,
  'router',
  'unimernet-tiny',
  'mathpix',
] as const;
export type EngineName = (typeof ENGINE_NAMES)[number];

export interface RunOutput {
  /** Final LaTeX, or null if the engine produced nothing usable. */
  readonly latex: string | null;
  readonly costUsd: number;
  /** Engine that produced `latex`; differs from the runner name for the router. */
  readonly servedBy?: string;
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

export function createRunners(names: readonly EngineName[], env: BenchEnv): BenchRunner[] {
  return names.map((name) => createRunner(name, env));
}

/** Production routing plan: cheap model first, strongest Flash on failure. */
const ROUTER_CHAIN: readonly GeminiPresetName[] = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

function createRunner(name: EngineName, env: BenchEnv): BenchRunner {
  switch (name) {
    case 'mathpix':
      return singleEngineRunner(name, createMathpix(env));
    case 'unimernet-tiny':
      return singleEngineRunner(name, new UnimernetEngine({ baseUrl: env.UNIMERNET_URL }));
    case 'router':
      // The self-hosted UniMERNet fallback joins the chain once it exists.
      return routerRunner(new OcrRouter(ROUTER_CHAIN.map((preset) => createGemini(preset, env))));
    default:
      return singleEngineRunner(name, createGemini(name, env));
  }
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
        return { latex: output.latex, costUsd: output.usage?.costUsd ?? 0, servedBy: engine.id };
      } catch (error) {
        return { latex: null, costUsd: 0, error: errorMessage(error) };
      }
    },
  };
}

function routerRunner(router: OcrRouter): BenchRunner {
  return {
    name: 'router',
    async run(image) {
      const result = await router.recognize(image);
      if (result.status === 'ok') {
        return { latex: result.latex, costUsd: result.costUsd, servedBy: result.engineId };
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
