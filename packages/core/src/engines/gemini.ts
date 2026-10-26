import { ApiError, GoogleGenAI, createPartFromBase64 } from '@google/genai';

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
  readonly timeoutMs?: number;
  readonly retryPolicy?: RetryPolicy;
  /** Thinking adds latency and rarely helps transcription, so it is off by default. */
  readonly thinkingBudget?: number;
}

/** Published list prices; verify against https://ai.google.dev/gemini-api/docs/pricing. */
export const GEMINI_PRESETS = {
  'gemini-flash-lite': {
    model: 'gemini-2.5-flash-lite',
    pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  },
  'gemini-flash': {
    model: 'gemini-2.5-flash',
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  },
} as const satisfies Record<string, { model: string; pricing: TokenPricing }>;

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
      () => this.call(image, options),
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
          thinkingConfig: { thinkingBudget: this.config.thinkingBudget ?? 0 },
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
