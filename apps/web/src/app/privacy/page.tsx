import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export const metadata: Metadata = {
  title: 'Privacy · Snip',
  description:
    'What Snip does with your screenshots and what it keeps. Short version: very little.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = 'October 27, 2026';
const CONTACT_EMAIL = 'sharmarojin2022@gmail.com';
const GEMINI_TERMS_URL = 'https://ai.google.dev/gemini-api/terms';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-600">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 pt-10 pb-16">
        <h1 className="text-4xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated {UPDATED}</p>

        <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-slate-700">
          <p className="font-semibold text-indigo-900">The short version</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The area you select is sent for recognition and is not stored.</li>
            <li>The LaTeX you get back is not stored either.</li>
            <li>We keep usage counts per access key, so free quotas and costs work.</li>
            <li>No ads, no trackers, no cookies, and nothing is sold.</li>
          </ul>
        </div>

        <div className="mt-6 divide-y divide-slate-200">
          <Section title="When you snip">
            <p>
              Snip sends only the area you drag over, as an image, to the Snip service. The service
              passes it to Google&apos;s Gemini API, which reads the math and returns LaTeX. The
              image and the LaTeX are not saved by Snip, on our servers or anywhere else.
            </p>
            <p>
              Google processes the image under the{' '}
              <a href={GEMINI_TERMS_URL} className="underline hover:text-slate-900">
                Gemini API terms for paid services
              </a>
              , which say Google does not use it to improve its products. Google may keep it for a
              limited time to detect abuse.
            </p>
          </Section>

          <Section title="What we keep">
            <p>
              For each snip: the time, which access key made it, whether it succeeded, which model
              answered, the number of tokens, the cost, and how long it took. This is how monthly
              quotas, rate limits and our spending cap work. It never includes the image or the
              LaTeX.
            </p>
            <p>
              For each access key: the email address it was issued to and its monthly quota. For the
              waitlist: your email address and, if you arrived from a link with a{' '}
              <code className="font-mono text-sm">?ref=</code> tag, that tag.
            </p>
          </Section>

          <Section title="On your Mac">
            <p>
              Snip keeps its settings and your access key in its own folder in your Library,
              readable only by your account. It keeps a local log of how long each snip took, also
              without images or LaTeX. Nothing on your Mac is uploaded except the area you snip.
            </p>
          </Section>

          <Section title="Who runs what">
            <p>
              The website and the Snip service run on Cloudflare. Usage counts, access keys and the
              waitlist are stored in a Postgres database hosted by Neon in the United States.
              Recognition is done by Google&apos;s Gemini API. Like any web host, Cloudflare
              processes standard request data, such as IP addresses, to deliver the site and protect
              it from attacks.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900">
                {CONTACT_EMAIL}
              </a>{' '}
              to see what we hold about you, to leave the waitlist, or to have your access key and
              its usage history deleted. We&apos;ll update this page if any of this changes.
            </p>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
