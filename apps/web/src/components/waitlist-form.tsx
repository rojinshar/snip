'use client';

import { type SubmitEvent, useState } from 'react';

type Status =
  { kind: 'idle' } | { kind: 'submitting' } | { kind: 'done' } | { kind: 'error'; message: string };

const errorResponse = (body: unknown): string =>
  typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : 'Something went wrong. Please try again.';

export function WaitlistForm({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ kind: 'submitting' });
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          website: form.get('website'),
          source: new URLSearchParams(window.location.search).get('ref') ?? undefined,
        }),
      });
      if (response.ok) {
        setStatus({ kind: 'done' });
      } else {
        setStatus({
          kind: 'error',
          message: errorResponse(await response.json().catch(() => null)),
        });
      }
    } catch {
      setStatus({ kind: 'error', message: 'Network error. Please try again.' });
    }
  }

  if (status.kind === 'done') {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
        You&apos;re on the list. We&apos;ll email you when the beta opens.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
    >
      <label htmlFor={`${id}-email`} className="sr-only">
        Email address
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@university.edu"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <input
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <button
        type="submit"
        disabled={status.kind === 'submitting'}
        className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {status.kind === 'submitting' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full">
          {status.message}
        </p>
      )}
    </form>
  );
}
