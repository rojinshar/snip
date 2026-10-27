'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Served from R2, not the site's static assets: those answer byte-range requests with the
 * whole file, and iPhone Safari won't play a video without range support. Upload a new cut
 * with: wrangler r2 object put snip-releases/site/snip-demo.mp4 --file <mp4> --remote
 */
const VIDEO_URL = 'https://downloads.snip.rojinsharma.com/site/snip-demo.mp4';

/**
 * The real recording: Snip at real speed, the Overleaf part trimmed. It loops silently, or,
 * for people who ask their system for reduced motion, waits on its poster for a click. If
 * the video can't play, the static screen-to-clipboard example stands in.
 */
export function Demo() {
  const video = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  // Started from here rather than with the autoplay attribute: the server renders before it
  // knows the reduced-motion setting, and an autoplay attribute would start the video anyway.
  // The first render after hydration still reports the server's "no preference", so the
  // setting is read from the system here, not from that render.
  useEffect(() => {
    if (!prefersReducedMotion()) void video.current?.play().catch(() => undefined);
  }, [reducedMotion]);

  if (failed) {
    return (
      <figure className="mx-auto max-w-[720px]">
        <StaticExample />
      </figure>
    );
  }

  const waitingForClick = reducedMotion && !started;

  return (
    <figure className="mx-auto max-w-[720px]">
      <div className="relative">
        <video
          ref={video}
          src={VIDEO_URL}
          poster="/snip-demo-poster.jpg"
          loop
          muted
          playsInline
          preload="metadata"
          width={1600}
          height={1000}
          controls={reducedMotion && started}
          aria-label="Snip in use: press the hotkey over an equation in a PDF, then paste the LaTeX into Overleaf, where it compiles to the same equations"
          onError={() => {
            setFailed(true);
          }}
          className="block h-auto w-full rounded-xl border border-slate-200"
        />
        {waitingForClick && (
          <button
            type="button"
            onClick={() => {
              setStarted(true);
              void video.current?.play();
            }}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/10 hover:bg-slate-900/20 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-indigo-600">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
              </svg>
            </span>
            <span className="sr-only">Play the demo</span>
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-center text-sm text-slate-500">
        Snip runs at real speed. Overleaf is trimmed.
      </figcaption>
    </figure>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
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
