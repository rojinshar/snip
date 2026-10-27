'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type MouseEvent, useEffect, useState } from 'react';

import { focusSignup } from '@/lib/signup';

const sectionLinks = [
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

const linkClass = 'text-slate-600 hover:text-indigo-600';
const activeClass = 'text-indigo-600';

/** One nav for every page: the waitlist button leads, Download is always one click away. */
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

  // On the home page, scroll to the hero form and focus it; elsewhere, /#signup does that.
  function onSignupClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== '/') return;
    event.preventDefault();
    window.history.replaceState(null, '', '#signup');
    focusSignup(true);
  }

  const onDownload = pathname === '/download';

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-white transition-colors ${scrolled ? 'border-slate-200' : 'border-transparent'}`}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="text-xl font-semibold tracking-tight">
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
            className={`inline-flex items-center gap-1.5 ${onDownload ? activeClass : linkClass}`}
          >
            Download
            <span className="hidden rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 md:inline">
              beta
            </span>
          </Link>
          <Link
            href="/#signup"
            onClick={onSignupClick}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white shadow-sm hover:bg-indigo-700 md:px-4 md:py-2"
          >
            Get 200 free snips
          </Link>
        </div>
      </nav>
    </header>
  );
}
