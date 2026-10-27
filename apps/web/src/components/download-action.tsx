'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';

import { currentPlatform } from '@/lib/platform';

const PAGE_URL = 'https://snip.rojinsharma.com/download';
export const SETUP_SECTION_ID = 'setup';

const buttonClass =
  'inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-300 focus:outline-none';

/**
 * The download button, or what to do instead on a phone or a non-Mac computer. Renders the
 * Mac button until the browser has been checked, so it is never missing for Mac visitors.
 */
export function DownloadAction({ url }: { url: string }) {
  // The server render (and any detection failure) shows the Mac button.
  const platform = useSyncExternalStore(subscribeNever, currentPlatform, () => 'mac' as const);
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  // The link itself downloads the .dmg, so the page stays put; this only adds guidance.
  function onDownload() {
    setStarted(true);
    window.setTimeout(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById(SETUP_SECTION_ID)
        ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 600);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(PAGE_URL);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  }

  if (platform === 'mobile') {
    return (
      <div className="mt-8">
        <p className="text-slate-700">
          Snip is a Mac app. Open this page on your Mac to download it.
        </p>
        <button type="button" onClick={() => void onCopy()} className={`mt-4 ${buttonClass}`}>
          {copied === 'copied' ? 'Link copied' : 'Copy link'}
        </button>
        {copied === 'failed' && (
          <p className="mt-2 text-sm text-slate-500">Couldn&apos;t copy. The link is {PAGE_URL}</p>
        )}
      </div>
    );
  }

  if (platform === 'other') {
    return (
      <div className="mt-8">
        <p className="text-slate-700">
          Snip is Mac-only for now. Join the waitlist and we&apos;ll tell you when Windows is ready.
        </p>
        <Link href="/#signup" className={`mt-4 ${buttonClass}`}>
          Join the waitlist
        </Link>
      </div>
    );
  }

  if (started) {
    return (
      <div
        role="status"
        className="mx-auto mt-8 max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      >
        <p className="font-semibold text-emerald-900">Your download is starting.</p>
        <p className="mt-1 text-emerald-800">
          Next: open Snip.dmg and drag Snip into Applications.
        </p>
        <a href={url} className="mt-3 inline-block text-sm text-emerald-900 underline">
          Download didn&apos;t start? Try again
        </a>
      </div>
    );
  }

  return (
    <a href={url} onClick={onDownload} className={`mt-6 ${buttonClass}`}>
      Download for Mac
    </a>
  );
}

/** The platform never changes during a visit, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => undefined;
}
