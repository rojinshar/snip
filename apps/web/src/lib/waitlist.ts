import { z } from 'zod';

export const waitlistRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  /** Campaign tag from the page URL (?ref=reddit-latex), used to see which posts convert. */
  source: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional()
    .catch(undefined),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().optional(),
});

export interface WaitlistSignup {
  readonly email: string;
  readonly source?: string;
}

export interface WaitlistRepository {
  /** Stores a sign-up. Must be idempotent: signing up twice is not an error. */
  add(signup: WaitlistSignup): Promise<void>;
}

export interface Logger {
  error(message: string, error?: unknown): void;
}

/**
 * Validates and stores a waitlist sign-up. Always answers success for valid input, so
 * the endpoint cannot be used to check whether an email is already on the list.
 */
export async function handleWaitlistRequest(
  request: Request,
  repository: WaitlistRepository,
  logger: Logger = console,
): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = waitlistRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const { email, source, website } = parsed.data;
  if (website) return Response.json({ ok: true });

  try {
    await repository.add({ email, ...(source ? { source } : {}) });
  } catch (error) {
    logger.error('waitlist: failed to store sign-up', error);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
