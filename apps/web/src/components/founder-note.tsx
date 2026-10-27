import { existsSync } from 'node:fs';
import { join } from 'node:path';

import Image from 'next/image';

// The page is prerendered, so this runs once at build time. Drop public/rojin.jpg in to show it.
const hasPhoto = existsSync(join(process.cwd(), 'public', 'rojin.jpg'));

export function FounderNote() {
  return (
    <section className="border-t border-slate-200">
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-6 px-6 py-16 sm:flex-row sm:items-start">
        {hasPhoto && (
          <Image
            src="/rojin.jpg"
            alt="Rojin"
            width={72}
            height={72}
            className="h-18 w-18 shrink-0 rounded-full object-cover"
          />
        )}
        <div className={hasPhoto ? 'text-center sm:text-left' : 'text-center'}>
          <p className="text-slate-700">
            I&apos;m Rojin, a math and physics student at Vanderbilt. I was spending half my problem
            sets retyping equations from textbook PDFs, symbol by symbol, so I built Snip. If you
            write LaTeX every week, I&apos;d love for you to try it.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            —{' '}
            <a
              href="https://rojinsharma.com"
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Rojin
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
