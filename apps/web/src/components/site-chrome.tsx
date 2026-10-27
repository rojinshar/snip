import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
      <span>© {new Date().getFullYear()} Snip</span>
      <nav className="flex gap-6">
        <Link href="/download" className="hover:text-slate-700">
          Download (beta)
        </Link>
        <Link href="/#faq" className="hover:text-slate-700">
          FAQ
        </Link>
        <Link href="/privacy" className="hover:text-slate-700">
          Privacy
        </Link>
      </nav>
    </footer>
  );
}
