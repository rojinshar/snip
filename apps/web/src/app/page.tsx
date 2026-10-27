import { Demo } from '@/components/demo';
import { FounderNote } from '@/components/founder-note';
import { WaitlistForm } from '@/components/waitlist-form';
import {
  MATHPIX_CHECKED,
  MATHPIX_FREE_SNIPS,
  MATHPIX_FREE_SNIPS_NO_EDU,
  MATHPIX_PRICING_URL,
} from '@/lib/mathpix';

const comparison = [
  {
    label: 'Free snips per month',
    snip: '200',
    mathpix: String(MATHPIX_FREE_SNIPS),
    chat: 'Free, but manual',
  },
  {
    label: 'Steps per equation',
    snip: '1 hotkey',
    mathpix: '1 hotkey',
    chat: 'Open app, upload, prompt, copy, clean up',
  },
  { label: 'LaTeX straight to clipboard', snip: 'Yes', mathpix: 'Yes', chat: 'No' },
  // "—" marks Mathpix behaviour we have not verified.
  { label: 'Checked to compile before you paste', snip: 'Yes', mathpix: '—', chat: 'No' },
];

const products = [
  { key: 'snip', name: 'Snip', highlight: true },
  { key: 'mathpix', name: 'Mathpix (free, .edu)', highlight: false },
  { key: 'chat', name: 'ChatGPT / chat assistants', highlight: false },
] as const;

const steps = [
  { title: 'Press your hotkey', body: 'From any app: a PDF, lecture slides, a paper.' },
  { title: 'Drag a box', body: 'Select the equation.' },
  {
    title: 'Paste',
    body: 'Compile-checked LaTeX is already on your clipboard, in about 2 seconds.',
  },
];

const useCases = [
  {
    title: 'Problem sets',
    body: 'Copy the equation from the textbook PDF straight into Overleaf.',
  },
  { title: 'Papers and theses', body: 'Reproduce equations from the papers you cite.' },
  { title: 'Notes', body: 'Paste into Obsidian, Notion or Markdown with $...$ delimiters.' },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    detail: '200 snips every month · sign-in required',
    highlight: false,
  },
  {
    name: 'Student',
    price: '$2.99/mo',
    detail: 'or $19/year · unlimited fair use',
    highlight: true,
  },
  { name: 'Lifetime', price: '$29', detail: 'one-time · waitlist members only', highlight: false },
];

const faqs = [
  {
    q: 'Why not just paste the screenshot into ChatGPT?',
    a: "You can, but it takes a chat window, an upload, a prompt and a copy-paste every time, and the LaTeX isn't checked. Snip is one hotkey, and checked LaTeX is on your clipboard in about 2 seconds.",
  },
  {
    q: 'How is this different from Mathpix?',
    a: `Mathpix is excellent, but its free plan stops at ${MATHPIX_FREE_SNIPS} snips a month with a .edu email (${MATHPIX_FREE_SNIPS_NO_EDU} without), which a single problem set can use up. Snip gives you 200 free.`,
  },
  {
    q: 'Does it handle handwriting and long multi-line equations?',
    a: "They're in testing. We're benchmarking on real coursework and will turn them on when they're reliable.",
  },
  {
    q: 'What happens to my screenshots?',
    a: 'Each snip is sent to our recognition service to produce LaTeX and is not stored afterwards.',
  },
  {
    q: 'Which platforms?',
    a: 'macOS first. Windows, a Chrome extension and an Obsidian plugin come after launch.',
  },
  {
    q: 'When can I use it?',
    a: "We're opening a private beta soon. Join the waitlist and we'll email you an invite.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-xl font-semibold tracking-tight">Snip</span>
        <a href="#start" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Get 200 free snips
        </a>
      </header>

      <section id="start" className="mx-auto max-w-5xl px-6 pt-12 pb-12 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Screenshot any equation. Paste LaTeX.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Mathpix gives students {MATHPIX_FREE_SNIPS} free snips a month. Snip gives you 200.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-slate-500">
          Same hotkey. Same paste. LaTeX that compiles every time.
        </p>
        <div className="mt-8 flex justify-center">
          <WaitlistForm id="hero" />
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Mac first · Join now for the $29 lifetime deal · Screenshots are never stored
        </p>
      </section>

      <section aria-label="Demo" className="mx-auto max-w-4xl px-6 pb-20">
        <Demo />
      </section>

      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Why not Mathpix or ChatGPT?
          </h2>
          {/* Phones get one card per product instead, so no column hides off-screen. */}
          <div className="mt-12 grid gap-4 sm:hidden">
            {products.map((product) => (
              <div
                key={product.name}
                className={`rounded-xl border bg-white p-5 ${product.highlight ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}
              >
                <h3
                  className={`font-semibold ${product.highlight ? 'text-indigo-700' : 'text-slate-900'}`}
                >
                  {product.name}
                </h3>
                <dl className="mt-3 divide-y divide-slate-100 text-sm">
                  {comparison.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 py-2">
                      <dt className="text-slate-500">{row.label}</dt>
                      <dd
                        className={`text-right ${product.highlight ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}
                      >
                        {row[product.key]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-12 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="sticky left-0 bg-white p-4">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="bg-indigo-50 p-4 font-semibold text-indigo-700">
                    Snip
                  </th>
                  <th scope="col" className="p-4 font-semibold">
                    Mathpix (free, .edu)
                  </th>
                  <th scope="col" className="p-4 font-semibold">
                    ChatGPT / chat assistants
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {comparison.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="sticky left-0 bg-white p-4 font-medium">
                      {row.label}
                    </th>
                    <td className="bg-indigo-50 p-4 font-semibold text-indigo-700">{row.snip}</td>
                    <td className="p-4 text-slate-600">{row.mathpix}</td>
                    <td className="p-4 text-slate-600">{row.chat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Mathpix: {MATHPIX_FREE_SNIPS} with a .edu email; {MATHPIX_FREE_SNIPS_NO_EDU} without.
            From{' '}
            <a href={MATHPIX_PRICING_URL} className="underline hover:text-slate-700">
              mathpix.com/pricing/snip
            </a>
            , checked {MATHPIX_CHECKED}.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
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
      </section>

      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">Built for STEM students</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {useCases.map((useCase) => (
              <div key={useCase.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold">{useCase.title}</h3>
                <p className="mt-2 text-slate-600">{useCase.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
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
      </section>

      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">Questions</h2>
          <dl className="mt-10 divide-y divide-slate-200">
            {faqs.map((faq) => (
              <div key={faq.q} className="py-5">
                <dt className="font-semibold">{faq.q}</dt>
                <dd className="mt-2 text-slate-600">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <FounderNote />

      <section id="join" className="border-t border-slate-200 bg-indigo-600">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Stop retyping equations.</h2>
          <p className="mt-3 text-indigo-100">
            200 free snips a month. Early sign-ups get the $29 lifetime deal.
          </p>
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
