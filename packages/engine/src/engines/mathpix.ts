import { z } from 'zod';

import { OcrEngineError, isRetryableStatus } from '../errors.ts';
import { sanitizeModelOutput } from '../latex/sanitize.ts';
import { DEFAULT_RETRY_POLICY, type RetryPolicy, withRetry } from '../retry.ts';
import type { OcrEngine, OcrEngineOutput, OcrImage, RecognizeOptions } from './types.ts';

const MATHPIX_TEXT_ENDPOINT = 'https://api.mathpix.com/v3/text';

/** Mathpix Convert API image price; see https://mathpix.com/pricing/api. */
const DEFAULT_COST_PER_IMAGE_USD = 0.002;

const responseSchema = z.object({
  latex_styled: z.string().optional(),
  error: z.string().optional(),
});

export interface MathpixEngineConfig {
  readonly id?: string;
  readonly appId: string;
  readonly appKey: string;
  readonly costPerImageUsd?: number;
  readonly timeoutMs?: number;
  readonly retryPolicy?: RetryPolicy;
}

/** Reference engine: the incumbent we benchmark against. Not used in production routing. */
export class MathpixEngine implements OcrEngine {
  readonly id: string;
  private readonly config: MathpixEngineConfig;

  constructor(config: MathpixEngineConfig) {
    this.id = config.id ?? 'mathpix';
    this.config = config;
  }

  async recognize(image: OcrImage, options: RecognizeOptions = {}): Promise<OcrEngineOutput> {
    return withRetry(
      () => this.call(image, options),
      this.config.retryPolicy ?? DEFAULT_RETRY_POLICY,
    );
  }

  private async call(image: OcrImage, options: RecognizeOptions): Promise<OcrEngineOutput> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 30_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(MATHPIX_TEXT_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          app_id: this.config.appId,
          app_key: this.config.appKey,
        },
        body: JSON.stringify({
          src: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
          formats: ['latex_styled'],
        }),
        signal,
      });
    } catch (error) {
      throw new OcrEngineError(this.id, error instanceof Error ? error.message : String(error), {
        retryable: !options.signal?.aborted,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new OcrEngineError(
        this.id,
        `Mathpix API ${response.status}: ${await response.text()}`,
        {
          retryable: isRetryableStatus(response.status),
        },
      );
    }

    const body = responseSchema.parse(await response.json());
    if (body.error !== undefined) {
      throw new OcrEngineError(this.id, `Mathpix error: ${body.error}`, { retryable: false });
    }

    return {
      latex: sanitizeModelOutput(body.latex_styled ?? ''),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: this.config.costPerImageUsd ?? DEFAULT_COST_PER_IMAGE_USD,
      },
    };
  }
}
