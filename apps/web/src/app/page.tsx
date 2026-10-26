import Image from 'next/image';

import { WaitlistForm } from '@/components/waitlist-form';

const steps = [
  {
    title: 'Press your hotkey',
    body: 'From any app: a PDF, lecture slides, a paper, a photo of the whiteboard.',
  },
  {
    title: 'Drag a box',
    body: 'Select the equation, however long. Multi-line and matrices work too.',
  },
  {
    title: 'Paste',
    body: 'LaTeX is already on your clipboard, checked to compile before you see it.',
  },
];

const useCases = [
  {
    title: 'Problem sets',
    body: 'Copy the equation from the textbook PDF straight into Overleaf.',
  },
  { title: 'Notes', body: 'Paste into Obsidian, Notion or Markdown with $…$ delimiters.' },
  {
    title: 'Papers and theses',
    body: 'Reproduce long aligned equations from cited papers in seconds.',
  },
  { title: 'Handwriting', body: 'Snap your handwritten work and get LaTeX back.' },
];

const plans = [
  { name: 'Free', price: '$0', detail: '200 snips every month', highlight: false },
  {
    name: 'Student',
    price: '$2.99/mo',
    detail: 'or $19/year · unlimited fair use',
    highlight: true,
  },
  { name: 'Lifetime', price: '$29', detail: 'one-time · early waitlist only', highlight: false },
];

const faqs = [
  {
    q: 'Which platforms?',
    a: 'macOS first. Windows, a Chrome extension and an Obsidian plugin come after launch.',
  },
  {
    q: 'Why not just paste the screenshot into ChatGPT?',
    a: 'You can, but it takes a chat window, an upload and a copy-paste every time. Snip is one hotkey, and the LaTeX is on your clipboard in about a second.',
  },
  {
    q: 'What happens to my screenshots?',
    a: 'Each snip is sent to our recognition service to produce LaTeX and is not stored afterwards.',
  },
  {
    q: 'When can I use it?',
    a: 'We are opening a private beta soon. Join the waitlist and we will email you an invite.',
  },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-xl font-semibold tracking-tight">Snip</span>
        <a href="#join" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Join the waitlist
        </a>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-12 pb-16 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Screenshot any equation. Paste LaTeX.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Press a hotkey, drag a box over any equation, and paste-ready LaTeX lands on your
          clipboard in about a second. No retyping, no chat windows.
        </p>
        <div className="mt-8 flex justify-center">
          <WaitlistForm id="hero" />
        </div>
        <p className="mt-3 text-sm text-slate-500">Mac first · 200 free snips every month</p>
      </section>

      <section aria-label="Example" className="mx-auto max-w-4xl px-6 pb-20">
        <div className="grid items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-[1fr_auto_1fr]">
          <figure className="min-w-0">
            <figcaption className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              On your screen
            </figcaption>
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
          </figure>
          <span aria-hidden="true" className="text-center text-2xl text-slate-400 sm:px-2">
            <span className="sm:hidden">↓</span>
            <span className="hidden sm:inline">→</span>
          </span>
          <figure className="min-w-0">
            <figcaption className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              On your clipboard
            </figcaption>
            <pre className="rounded-lg bg-slate-900 p-4 font-mono text-sm break-all whitespace-pre-wrap text-slate-100">
              <code>{String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`}</code>
            </pre>
          </figure>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Built for STEM students</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {useCases.map((useCase) => (
            <div key={useCase.title} className="rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold">{useCase.title}</h3>
              <p className="mt-2 text-slate-600">{useCase.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">Planned pricing</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border bg-white p-6 text-center ${plan.highlight ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}
              >
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-3 text-3xl font-bold">{plan.price}</p>
                <p className="mt-2 text-sm text-slate-600">{plan.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Questions</h2>
        <dl className="mt-10 divide-y divide-slate-200">
          {faqs.map((faq) => (
            <div key={faq.q} className="py-5">
              <dt className="font-semibold">{faq.q}</dt>
              <dd className="mt-2 text-slate-600">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="join" className="border-t border-slate-200 bg-indigo-600">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Stop retyping equations.</h2>
          <p className="mt-3 text-indigo-100">Get an invite to the private beta.</p>
          <div className="mt-8 flex w-full justify-center rounded-xl bg-white p-4 text-left text-slate-900">
            <WaitlistForm id="footer" />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Snip
      </footer>
    </main>
  );
}
