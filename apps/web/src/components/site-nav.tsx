'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type MouseEvent, useEffect, useState } from 'react';

const sectionLinks = [
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

const linkClass = 'text-slate-600 hover:text-indigo-600';

/** One nav for every page, with Download one click away. */
export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Already on the home page, a link to "/" would do nothing, so scroll back to the top and
  // drop any #section from the address bar.
  function onLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== '/') return;
    event.preventDefault();
    window.history.replaceState(null, '', '/');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  const onDownload = pathname === '/download';

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-white transition-colors ${scrolled ? 'border-slate-200' : 'border-transparent'}`}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" onClick={onLogoClick} className="text-xl font-semibold tracking-tight">
          Snip
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium whitespace-nowrap md:gap-6">
          {sectionLinks.map((link) => (
            <Link key={link.href} href={link.href} className={`hidden md:inline ${linkClass}`}>
              {link.label}
            </Link>
          ))}
          <Link
            href="/download"
            aria-current={onDownload ? 'page' : undefined}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white shadow-sm hover:bg-indigo-700 md:px-4 md:py-2"
          >
            Download free
          </Link>
        </div>
      </nav>
    </header>
  );
}
