'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * Plays /demo.mp4 once it has loaded. Until then, and for good if the file is missing or
 * fails, the static screen-to-clipboard example stands in, so the section never breaks.
 */
export function Demo() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // The video can finish loading before hydration attaches onLoadedData.
  useEffect(() => {
    if ((video.current?.readyState ?? 0) >= HTMLMediaElement.HAVE_CURRENT_DATA) setPlaying(true);
  }, []);

  return (
    <figure className="relative">
      <video
        ref={video}
        src="/demo.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Snip turning a screenshot of an equation into LaTeX, in real time"
        onLoadedData={() => {
          setPlaying(true);
        }}
        className={
          playing
            ? 'block h-auto w-full rounded-2xl border border-slate-200'
            : 'pointer-events-none absolute inset-0 h-full w-full opacity-0'
        }
      />
      {playing ? (
        <figcaption className="mt-3 text-center text-sm text-slate-500">
          Real speed. Not sped up.
        </figcaption>
      ) : (
        <StaticExample />
      )}
    </figure>
  );
}

function StaticExample() {
  return (
    <div className="grid items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-[1fr_auto_1fr]">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
          On your screen
        </p>
        <div className="rounded-lg border-2 border-dashed border-indigo-400 bg-white p-2">
          <Image
            src="/demo-equation.png"
            alt="The Gaussian integral, rendered as an image"
            width={480}
            height={150}
            className="h-auto w-full"
            priority
          />
        </div>
      </div>
      <span aria-hidden="true" className="text-center text-2xl text-slate-400 sm:px-2">
        <span className="sm:hidden">↓</span>
        <span className="hidden sm:inline">→</span>
      </span>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
          On your clipboard
        </p>
        <pre className="rounded-lg bg-slate-900 p-4 font-mono text-sm break-all whitespace-pre-wrap text-slate-100">
          <code>{String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`}</code>
        </pre>
      </div>
    </div>
  );
}
