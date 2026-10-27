import { randomUUID } from 'node:crypto';

import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { type AccessLimits, decideAccess, quotaResetsAt } from './access.ts';
import type { AccessStore } from './access-store.ts';
import { bearerToken } from './auth.ts';
import { detectImageType } from './image.ts';
import { hashAccessKey } from './keys.ts';
import type { Logger } from './logger.ts';
import type { RecognizeErrorCode, RecognizeResult, Recognizer } from './recognize.ts';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ApiErrorCode =
  | 'invalid_key'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'capacity'
  | 'invalid_image'
  | 'image_too_large'
  | 'internal_error'
  | RecognizeErrorCode;

const ERRORS: Readonly<Record<ApiErrorCode, { status: number; message: string }>> = {
  invalid_key: { status: 401, message: "That access key isn't valid." },
  quota_exceeded: { status: 429, message: "You've used this month's snips." },
  rate_limited: { status: 429, message: 'Too many snips at once. Wait a minute.' },
  capacity: { status: 503, message: 'Snip is busy right now. Try again later.' },
  invalid_image: { status: 400, message: 'Could not read that image.' },
  image_too_large: { status: 413, message: 'Image is over 10 MB.' },
  no_math_found: { status: 422, message: 'No equation found in the selection.' },
  upstream_failed: { status: 502, message: 'Recognition is unavailable. Try again.' },
  internal_error: { status: 500, message: 'Something went wrong.' },
};

/** Access keys, quotas, rate limit and spending cap (docs/beta-v1.md §4–5). */
export interface AccessControl {
  readonly store: AccessStore;
  readonly limits: AccessLimits;
  /**
   * Keeps work running after the response is sent: Workers' `waitUntil`. Without it the
   * usage row is written in the background, which is fine in Node.
   */
  readonly defer?: (work: Promise<unknown>) => void;
}

export interface AppDeps {
  readonly recognizer: Recognizer;
  readonly logger: Logger;
  /** Omit to accept every request without a key (local development). */
  readonly access?: AccessControl;
  readonly now?: () => number;
  readonly clock?: () => Date;
  readonly requestId?: () => string;
}

export function createApp(deps: AppDeps): Express {
  const now = deps.now ?? (() => performance.now());
  const clock = deps.clock ?? (() => new Date());
  const requestId = deps.requestId ?? randomUUID;
  const { access } = deps;
  const app = express();
  app.disable('x-powered-by');

  // Request id + one structured log line per request. Never logs image data or LaTeX.
  app.use((req, res, next) => {
    const id = requestId();
    const startedAt = now();
    res.locals.id = id;
    res.setHeader('X-Request-Id', id);
    res.on('finish', () => {
      deps.logger.info('request', {
        id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(now() - startedAt),
        ...(typeof res.locals.keyId === 'number' ? { keyId: res.locals.keyId } : {}),
        ...(typeof res.locals.bytes === 'number' ? { bytes: res.locals.bytes } : {}),
        ...(typeof res.locals.engine === 'string' ? { engine: res.locals.engine } : {}),
        ...(typeof res.locals.detail === 'string' ? { detail: res.locals.detail } : {}),
        ...(Array.isArray(res.locals.attempts) ? { attempts: res.locals.attempts } : {}),
      });
    });
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Quota and usage for the key, for the app's Settings window. Not rate-limited. */
  app.get('/v1/me', async (req: Request, res: Response) => {
    if (!access) {
      // Local development: no keys, no quota.
      res.json({ quota: null, used: null, resetsAt: null });
      return;
    }
    const token = bearerToken(req.headers.authorization);
    const usage = token === null ? null : await access.store.usage(hashAccessKey(token));
    if (usage === null || usage.revoked) {
      sendError(res, 'invalid_key');
      return;
    }
    res.locals.keyId = usage.keyId;
    res.json({
      quota: usage.monthlyQuota,
      used: usage.usedThisMonth,
      resetsAt: quotaResetsAt(clock()).toISOString(),
    });
  });

  // Runs before the body is read, so a rejected upload costs neither bandwidth nor Gemini.
  const requireAccess = async (req: Request, res: Response, next: NextFunction) => {
    if (!access) {
      next();
      return;
    }
    const token = bearerToken(req.headers.authorization);
    const usage = token === null ? null : await access.store.usage(hashAccessKey(token));
    const decision = decideAccess(usage, access.limits);
    if (!decision.ok) {
      if (decision.error === 'quota_exceeded') {
        sendError(res, decision.error, { resetsAt: quotaResetsAt(clock()).toISOString() });
      } else {
        sendError(res, decision.error);
      }
      return;
    }
    res.locals.keyId = decision.keyId;
    next();
  };

  // Every recognition that reached Gemini is recorded, successful or not: each one cost money.
  const recordUsage = (res: Response, result: RecognizeResult, ms: number) => {
    const keyId: unknown = res.locals.keyId;
    if (!access || typeof keyId !== 'number') return;
    const work = access.store
      .record({
        keyId,
        status: result.ok ? 200 : ERRORS[result.error].status,
        ...(result.ok ? { engine: result.engine } : {}),
        inputTokens: sum(result.attempts.map((a) => a.inputTokens ?? 0)),
        outputTokens: sum(result.attempts.map((a) => a.outputTokens ?? 0)),
        costUsd: result.costUsd,
        ms,
      })
      .catch((error: unknown) => {
        deps.logger.error('could not record usage', {
          keyId,
          detail: error instanceof Error ? error.message : String(error),
        });
      });
    if (access.defer) access.defer(work);
  };

  // The body is the raw image. Its type is checked from its bytes, not the header.
  app.post(
    '/v1/recognize',
    requireAccess,
    express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
    async (req: Request, res: Response) => {
      const body: unknown = req.body;
      const data = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
      const mimeType = detectImageType(data);
      if (mimeType === null) {
        sendError(res, 'invalid_image');
        return;
      }

      res.locals.bytes = data.length;
      const startedAt = now();
      const result = await deps.recognizer.recognize({ data, mimeType });
      const ms = Math.round(now() - startedAt);
      recordUsage(res, result, ms);
      res.locals.attempts = result.attempts;
      if (!result.ok) {
        res.locals.detail = result.detail;
        sendError(res, result.error);
        return;
      }
      res.locals.engine = result.engine;
      res.json({ latex: result.latex, engine: result.engine, ms });
    },
  );

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (isBodyTooLarge(error)) {
      sendError(res, 'image_too_large');
      return;
    }
    res.locals.detail = error instanceof Error ? error.message : String(error);
    sendError(res, 'internal_error');
  };
  app.use(errorHandler);

  return app;
}

function sendError(res: Response, code: ApiErrorCode, extra: Record<string, string> = {}): void {
  const { status, message } = ERRORS[code];
  res.status(status).json({ error: code, message, ...extra });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isBodyTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  );
}
