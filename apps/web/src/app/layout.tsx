import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const title = 'Snip — Screenshot any equation, paste LaTeX';
const description =
  '200 free snips a month. One hotkey, compile-checked LaTeX on your clipboard in about 2 seconds.';
const image = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Screenshot any equation. Paste LaTeX.',
};

export const metadata: Metadata = {
  // Link previews need absolute image URLs.
  metadataBase: new URL('https://snip.rojinsharma.com'),
  title,
  description,
  openGraph: { type: 'website', url: '/', siteName: 'Snip', title, description, images: [image] },
  twitter: { card: 'summary_large_image', title, description, images: [image] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-white font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
