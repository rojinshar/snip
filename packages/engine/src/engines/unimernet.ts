import { z } from 'zod';

import { OcrEngineError, isRetryableStatus } from '../errors.ts';
import { sanitizeModelOutput } from '../latex/sanitize.ts';
import { DEFAULT_RETRY_POLICY, type RetryPolicy, withRetry } from '../retry.ts';
import type { OcrEngine, OcrEngineOutput, OcrImage, RecognizeOptions } from './types.ts';

const responseSchema = z.object({
  latex: z.string(),
  confidence: z.object({ mean_token_prob: z.number(), min_token_prob: z.number() }),
  inference_ms: z.number(),
  device: z.string(),
});

export interface UnimernetEngineConfig {
  readonly id?: string;
  /** Base URL of apps/unimernet-server, e.g. http://127.0.0.1:8765. */
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly retryPolicy?: RetryPolicy;
}

/**
 * Client for the self-hosted UniMERNet server. Self-hosted inference has no per-call price,
 * so usage reports zero cost; the server's fixed cost is accounted for elsewhere.
 */
export class UnimernetEngine implements OcrEngine {
  readonly id: string;
  private readonly config: UnimernetEngineConfig;
  private readonly endpoint: string;

  constructor(config: UnimernetEngineConfig) {
    this.id = config.id ?? 'unimernet-tiny';
    this.config = config;
    this.endpoint = new URL('/v1/recognize', config.baseUrl).toString();
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
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': image.mimeType },
        body: image.data,
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OcrEngineError(this.id, `cannot reach ${this.endpoint}: ${message}`, {
        retryable: !options.signal?.aborted,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new OcrEngineError(this.id, `server ${response.status}: ${await response.text()}`, {
        retryable: isRetryableStatus(response.status),
      });
    }

    const body = responseSchema.parse(await response.json());
    return {
      latex: sanitizeModelOutput(body.latex),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      confidence: { mean: body.confidence.mean_token_prob, min: body.confidence.min_token_prob },
    };
  }
}
