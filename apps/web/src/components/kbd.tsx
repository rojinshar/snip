import type { ReactNode } from 'react';

/** A keyboard key, e.g. <Kbd>⌘</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5em] items-center justify-center rounded border border-slate-300 bg-white px-1 font-sans text-[0.85em] leading-snug text-slate-700 shadow-[0_1px_0_rgb(0_0_0/0.08)]">
      {children}
    </kbd>
  );
}

/** The default Snip hotkey, ⇧⌘2, as keys. */
export function SnipHotkey() {
  return (
    <span className="inline-flex gap-0.5 align-baseline">
      <Kbd>⇧</Kbd>
      <Kbd>⌘</Kbd>
      <Kbd>2</Kbd>
    </span>
  );
}
