'use client';

import Link from 'next/link';
import { type SubmitEvent, useEffect, useState } from 'react';

import { refTracker } from '@/lib/ref';
import { SIGNUP_INPUT_ID, focusSignup } from '@/lib/signup';

type Status =
  { kind: 'idle' } | { kind: 'submitting' } | { kind: 'done' } | { kind: 'error'; message: string };

const errorResponse = (body: unknown): string =>
  typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : 'Something went wrong. Please try again.';

export function WaitlistForm({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    refTracker.capture(window.location.search);
  }, []);

  // Arriving at /#signup (the nav button from another page) puts the cursor in the hero form.
  useEffect(() => {
    if (`${id}-email` !== SIGNUP_INPUT_ID) return;
    const onHash = () => {
      if (window.location.hash === '#signup') focusSignup(false);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, [id]);

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
          source: refTracker.current(),
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
      <div role="status" className="w-full max-w-md">
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
          You&apos;re on the list. We&apos;re inviting people in small groups and will email your
          access key.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Already have a key?{' '}
          <Link href="/download" className="font-medium text-indigo-600 hover:text-indigo-700">
            Download for Mac →
          </Link>
        </p>
      </div>
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
        {status.kind === 'submitting' ? 'Joining…' : 'Get 200 free snips'}
      </button>
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full">
          {status.message}
        </p>
      )}
    </form>
  );
}
