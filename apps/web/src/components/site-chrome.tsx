import Link from 'next/link';

/** Header for pages other than the landing page. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-xl font-semibold tracking-tight">
        Snip
      </Link>
      <Link href="/#join" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
        Join the waitlist
      </Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
      <span>© {new Date().getFullYear()} Snip</span>
      <nav className="flex gap-6">
        <Link href="/download" className="hover:text-slate-700">
          Download (beta)
        </Link>
        <Link href="/privacy" className="hover:text-slate-700">
          Privacy
        </Link>
      </nav>
    </footer>
  );
}
