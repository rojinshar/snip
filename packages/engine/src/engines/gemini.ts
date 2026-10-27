import { ApiError, GoogleGenAI, ThinkingLevel, createPartFromBase64 } from '@google/genai';

import { OcrEngineError, isRetryableStatus } from '../errors.ts';
import { sanitizeModelOutput } from '../latex/sanitize.ts';
import { DEFAULT_RETRY_POLICY, type RetryPolicy, withRetry } from '../retry.ts';
import { LATEX_OCR_PROMPT } from './prompt.ts';
import type { OcrEngine, OcrEngineOutput, OcrImage, RecognizeOptions } from './types.ts';

/** USD per one million tokens. */
export interface TokenPricing {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

export interface GeminiEngineConfig {
  readonly id: string;
  readonly model: string;
  readonly apiKey: string;
  readonly pricing: TokenPricing;
  /** Request deadline. Gemini rejects values under 10 s with 400 INVALID_ARGUMENT. */
  readonly timeoutMs?: number;
  readonly retryPolicy?: RetryPolicy;
  /**
   * Gemini 3 models cannot disable thinking; it adds latency and rarely helps transcription,
   * so presets pin the lowest level each model allows. Omit to use the model default.
   */
  readonly thinkingLevel?: ThinkingLevel;
}

interface GeminiPreset {
  readonly model: string;
  readonly pricing: TokenPricing;
  readonly thinkingLevel?: ThinkingLevel;
}

/**
 * Paid-tier list prices as of 2026-10; verify against
 * https://ai.google.dev/gemini-api/docs/pricing. Thinking levels per
 * https://ai.google.dev/gemini-api/docs/thinking.
 */
export const GEMINI_PRESETS = {
  /** Google's recommended high-volume model; planned default. */
  'gemini-3.5-flash-lite': {
    model: 'gemini-3.5-flash-lite',
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
    thinkingLevel: ThinkingLevel.MINIMAL,
  },
  /** Cheaper previous generation; candidate default if accuracy holds up. */
  'gemini-3.1-flash-lite': {
    model: 'gemini-3.1-flash-lite',
    pricing: { inputPerMillion: 0.25, outputPerMillion: 1.5 },
  },
  /** Strongest Flash model; planned retry. Price doubles on 2027-01-01 ($1.50 / $7.50). */
  'gemini-3.8-flash': {
    model: 'gemini-3.8-flash',
    pricing: { inputPerMillion: 0.75, outputPerMillion: 3.75 },
    thinkingLevel: ThinkingLevel.LOW,
  },
} as const satisfies Record<string, GeminiPreset>;

export type GeminiPresetName = keyof typeof GEMINI_PRESETS;

export class GeminiEngine implements OcrEngine {
  readonly id: string;
  private readonly client: GoogleGenAI;
  private readonly config: GeminiEngineConfig;

  constructor(config: GeminiEngineConfig) {
    this.id = config.id;
    this.config = config;
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { timeout: config.timeoutMs ?? 30_000 },
    });
  }

  async recognize(image: OcrImage, options: RecognizeOptions = {}): Promise<OcrEngineOutput> {
    return withRetry(
      async (attempt) => ({ ...(await this.call(image, options)), retries: attempt - 1 }),
      this.config.retryPolicy ?? DEFAULT_RETRY_POLICY,
    );
  }

  private async call(image: OcrImage, options: RecognizeOptions): Promise<OcrEngineOutput> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [
          {
            role: 'user',
            parts: [createPartFromBase64(image.data.toString('base64'), image.mimeType)],
          },
        ],
        config: {
          systemInstruction: LATEX_OCR_PROMPT,
          temperature: 0,
          maxOutputTokens: 2048,
          ...(this.config.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: this.config.thinkingLevel } }
            : {}),
          ...(options.signal ? { abortSignal: options.signal } : {}),
        },
      });
    } catch (error) {
      throw this.toEngineError(error);
    }

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    // Thinking tokens are billed as output.
    const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    const { inputPerMillion, outputPerMillion } = this.config.pricing;

    return {
      latex: sanitizeModelOutput(response.text ?? ''),
      usage: {
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000,
      },
    };
  }

  private toEngineError(error: unknown): OcrEngineError {
    if (error instanceof ApiError) {
      return new OcrEngineError(this.id, `Gemini API ${error.status}: ${error.message}`, {
        retryable: isRetryableStatus(error.status),
        cause: error,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    const aborted = error instanceof Error && error.name === 'AbortError';
    return new OcrEngineError(this.id, message, { retryable: !aborted, cause: error });
  }
}
