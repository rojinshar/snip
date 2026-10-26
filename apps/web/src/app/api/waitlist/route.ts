import { createNeonWaitlistRepository } from '@/lib/neon-waitlist-repository';
import { handleWaitlistRequest } from '@/lib/waitlist';

export async function POST(request: Request): Promise<Response> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('waitlist: DATABASE_URL is not set');
    return Response.json({ error: 'Sign-ups are temporarily unavailable.' }, { status: 503 });
  }
  return handleWaitlistRequest(request, createNeonWaitlistRepository(databaseUrl));
}
