import { randomUUID } from 'node:crypto';

import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { type AccessDecision, type AccessLimits, decideAccess, quotaResetsAt } from './access.ts';
import type { AccessStore } from './access-store.ts';
import { bearerToken } from './auth.ts';
import { detectImageType } from './image.ts';
import type { RegistrationConfig } from './config.ts';
import { accessKeyHint, generateAccessKey, hashAccessKey, hashIp } from './keys.ts';
import type { Logger } from './logger.ts';
import type { RecognizeErrorCode, RecognizeResult, Recognizer } from './recognize.ts';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ApiErrorCode =
  | 'invalid_key'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'capacity'
  | 'registration_limited'
  | 'registration_closed'
  | 'invalid_image'
  | 'image_too_large'
  | 'internal_error'
  | RecognizeErrorCode;

const ERRORS: Readonly<Record<ApiErrorCode, { status: number; message: string }>> = {
  invalid_key: { status: 401, message: "That access key isn't valid." },
  quota_exceeded: { status: 429, message: "You've used this month's snips." },
  rate_limited: { status: 429, message: 'Too many snips at once. Wait a minute.' },
  capacity: { status: 503, message: 'Snip is busy right now. Try again later.' },
  registration_limited: {
    status: 429,
    message: 'Too many new installs from this network today. Try again tomorrow.',
  },
  registration_closed: { status: 403, message: "New installs can't sign up right now." },
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
  /** Omit to close self-registration (docs/beta-v1.md §15). */
  readonly registration?: RegistrationConfig;
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

  /**
   * A key for an install that has none, so the app works without an invite. Limited per IP;
   * the spending cap bounds what farmed keys can cost.
   */
  app.post('/v1/register', async (req: Request, res: Response) => {
    const registration = access?.registration;
    if (!access || !registration) {
      sendError(res, 'registration_closed');
      return;
    }
    const key = generateAccessKey();
    const keyId = await access.store.register({
      keyHash: hashAccessKey(key),
      keyHint: accessKeyHint(key),
      monthlyQuota: registration.monthlyQuota,
      ipHash: hashIp(clientIp(req), registration.secret),
      maxPerIp: registration.perIpPerDay,
    });
    if (keyId === null) {
      sendError(res, 'registration_limited');
      return;
    }
    res.locals.keyId = keyId;
    res.status(201).json({
      key,
      quota: registration.monthlyQuota,
      used: 0,
      resetsAt: quotaResetsAt(clock()).toISOString(),
    });
  });

  // Started as soon as the request arrives, so the database round trip overlaps with the image
  // upload. Gemini is only called after the key is approved (awaitAccess), so a rejected key
  // never costs a recognition.
  const pendingAccess = new WeakMap<Response, Promise<AccessDecision>>();
  const startAccessCheck = (req: Request, res: Response, next: NextFunction) => {
    if (access) {
      const token = bearerToken(req.headers.authorization);
      const lookup =
        token === null ? Promise.resolve(null) : access.store.usage(hashAccessKey(token));
      const check = lookup.then((usage) => decideAccess(usage, access.limits));
      // Awaited later; if the upload fails first, nothing awaits it.
      check.catch(() => undefined);
      pendingAccess.set(res, check);
    }
    next();
  };

  /** Sends the rejection and returns false when this key may not recognize right now. */
  const awaitAccess = async (res: Response): Promise<boolean> => {
    const check = pendingAccess.get(res);
    if (!check) return true;
    const decision = await check;
    if (!decision.ok) {
      if (decision.error === 'quota_exceeded') {
        sendError(res, decision.error, { resetsAt: quotaResetsAt(clock()).toISOString() });
      } else {
        sendError(res, decision.error);
      }
      return false;
    }
    res.locals.keyId = decision.keyId;
    return true;
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
    startAccessCheck,
    express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
    async (req: Request, res: Response) => {
      if (!(await awaitAccess(res))) return;
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
      res.json({ latex: result.latex, kind: result.kind, engine: result.engine, ms });
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

/**
 * Cloudflare sets CF-Connecting-IP on every request and overwrites any value a client sends.
 * The socket address is the fallback for the local Node server.
 */
function clientIp(req: Request): string {
  return req.get('cf-connecting-ip') ?? req.socket.remoteAddress ?? 'unknown';
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
