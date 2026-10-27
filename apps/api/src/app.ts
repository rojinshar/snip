import { randomUUID } from 'node:crypto';

import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { type Authorizer, bearerToken } from './auth.ts';
import { detectImageType } from './image.ts';
import type { Logger } from './logger.ts';
import type { RecognizeErrorCode, Recognizer } from './recognize.ts';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ApiErrorCode =
  'invalid_key' | 'invalid_image' | 'image_too_large' | 'internal_error' | RecognizeErrorCode;

const ERRORS: Readonly<Record<ApiErrorCode, { status: number; message: string }>> = {
  invalid_key: { status: 401, message: "That access key isn't valid." },
  invalid_image: { status: 400, message: 'Could not read that image.' },
  image_too_large: { status: 413, message: 'Image is over 10 MB.' },
  no_math_found: { status: 422, message: 'No equation found in the selection.' },
  upstream_failed: { status: 502, message: 'Recognition is unavailable. Try again.' },
  internal_error: { status: 500, message: 'Something went wrong.' },
};

export interface AppDeps {
  readonly recognizer: Recognizer;
  readonly logger: Logger;
  /** Omit to accept every request (local development). */
  readonly authorize?: Authorizer;
  readonly now?: () => number;
  readonly requestId?: () => string;
}

export function createApp(deps: AppDeps): Express {
  const now = deps.now ?? (() => performance.now());
  const requestId = deps.requestId ?? randomUUID;
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

  // The body is the raw image. Its type is checked from its bytes, not the header.
  app.post(
    '/v1/recognize',
    // Checked before the body is read, so unauthorized uploads cost nothing.
    async (req: Request, res: Response, next: NextFunction) => {
      if (deps.authorize && !(await deps.authorize(bearerToken(req.headers.authorization)))) {
        sendError(res, 'invalid_key');
        return;
      }
      next();
    },
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
      res.locals.attempts = result.attempts;
      if (!result.ok) {
        res.locals.detail = result.detail;
        sendError(res, result.error);
        return;
      }
      res.locals.engine = result.engine;
      res.json({ latex: result.latex, engine: result.engine, ms: Math.round(now() - startedAt) });
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

function sendError(res: Response, code: ApiErrorCode): void {
  const { status, message } = ERRORS[code];
  res.status(status).json({ error: code, message });
}

function isBodyTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  );
}
