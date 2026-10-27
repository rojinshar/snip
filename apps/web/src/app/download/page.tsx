import type { Metadata } from 'next';
import Link from 'next/link';

import { DownloadAction, SETUP_SECTION_ID } from '@/components/download-action';
import { SnipHotkey } from '@/components/kbd';
import { SiteFooter } from '@/components/site-chrome';
import { DOWNLOAD_URL, LATEST_VERSION } from '@/lib/release';

export const metadata: Metadata = {
  title: 'Download Snip for Mac (beta)',
  description: 'Download the Snip private beta for Mac. You need the access key from your invite.',
  alternates: { canonical: '/download' },
};

const steps = [
  {
    title: 'Install',
    body: 'Open the downloaded file and drag Snip into your Applications folder.',
  },
  {
    title: 'Open',
    body: 'Open Snip from Applications and choose Open when macOS asks. It lives in your menu bar as ∫, with no Dock icon, and opens by itself after a restart.',
  },
];

export default function Download() {
  return (
    <>
      <main>
        <section className="mx-auto max-w-3xl px-6 pt-12 pb-16 text-center sm:pt-16">
          <p className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
            Private beta
          </p>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Download Snip for Mac
          </h1>
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-slate-700">
            You&apos;ll need your access key. It&apos;s in your invite email.{' '}
            <span className="whitespace-nowrap">
              No invite yet?{' '}
              <Link href="/#signup" className="font-medium text-indigo-700 hover:text-indigo-800">
                Join the waitlist →
              </Link>
            </span>
          </div>
          <DownloadAction url={DOWNLOAD_URL} />
          <p className="mt-3 text-sm text-slate-500">
            Version {LATEST_VERSION} · Apple silicon (M1 or later) · macOS 13 Ventura or later
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Signed and notarized by Apple. Updates install themselves.
          </p>
        </section>

        <section id={SETUP_SECTION_ID} className="border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight">Set up in a minute</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-slate-600">{step.body}</p>
                </li>
              ))}
              <li className="rounded-xl border border-slate-200 bg-white p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">
                  3
                </span>
                <h3 className="mt-4 font-semibold">Snip</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600 marker:text-slate-400">
                  <li>
                    Press <SnipHotkey />
                  </li>
                  <li>Paste your access key into Settings</li>
                  <li>Allow Screen Recording when macOS asks</li>
                  <li>Choose Restart Snip from the ∫ menu</li>
                </ol>
                <p className="mt-4 text-sm text-slate-500">
                  Screen Recording is only used to capture the area you drag over.{' '}
                  <Link href="/privacy" className="underline hover:text-slate-700">
                    Nothing else leaves your Mac
                  </Link>
                  .
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight">No invite yet?</h2>
          <p className="mt-3 text-slate-600">
            We&apos;re letting people in from the waitlist in small groups.
          </p>
          <Link
            href="/#signup"
            className="mt-6 inline-block font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Join the waitlist →
          </Link>
          <p className="mt-10 text-sm text-slate-500">
            On an Intel Mac? It isn&apos;t supported yet; join the waitlist and we&apos;ll tell you
            when it is. · Read how Snip handles your screenshots in the{' '}
            <Link href="/privacy" className="underline hover:text-slate-700">
              privacy note
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
