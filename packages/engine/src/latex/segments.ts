/**
 * A snip is either `math` (bare LaTeX, which the app wraps in the user's delimiters) or
 * `text`: prose with math inside it, marked with $…$, $$…$$, \(…\) or \[…\], pasted as is.
 */
export type OutputKind = 'math' | 'text';

export interface Segment {
  readonly kind: 'prose' | 'math';
  readonly content: string;
}

const DELIMITERS: readonly (readonly [open: string, close: string])[] = [
  ['$$', '$$'],
  ['\\[', '\\]'],
  ['\\(', '\\)'],
  ['$', '$'],
];

/**
 * Splits text into prose and math segments. `\$` is a literal dollar sign, not a delimiter.
 * Returns null when a delimiter is never closed.
 */
export function splitMath(text: string): Segment[] | null {
  const segments: Segment[] = [];
  let prose = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('\\$', i)) {
      prose += '\\$';
      i += 2;
      continue;
    }
    const pair = DELIMITERS.find(([open]) => text.startsWith(open, i));
    if (pair === undefined) {
      prose += text.charAt(i);
      i += 1;
      continue;
    }
    const [open, close] = pair;
    const end = findClose(text, close, i + open.length);
    if (end === -1) return null;
    if (prose !== '') segments.push({ kind: 'prose', content: prose });
    prose = '';
    segments.push({ kind: 'math', content: text.slice(i + open.length, end) });
    i = end + close.length;
  }
  if (prose !== '') segments.push({ kind: 'prose', content: prose });
  return segments;
}

function findClose(text: string, close: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (close === '$' || close === '$$') {
      if (text.startsWith('\\$', i)) {
        i += 1;
        continue;
      }
    }
    if (text.startsWith(close, i)) return i;
  }
  return -1;
}

// Words inside \text{…} and similar belong to the math, not to surrounding prose.
const TEXT_COMMANDS = /\\(?:text\w*|mathrm|operatorname|mbox)\s*\{[^{}]*\}/g;
const PROSE_WORD = /(?<![\\A-Za-z])[A-Za-z]{3,}(?![A-Za-z])/g;
const PROSE_WORD_THRESHOLD = 4;

/**
 * `text` when the output marks math inside prose, or reads like sentences. Math rarely has
 * several bare words of three or more letters outside \text{…}; prose always does.
 */
export function classifyOutput(latex: string): OutputKind {
  const segments = splitMath(latex);
  if (segments?.some((segment) => segment.kind === 'math') === true) return 'text';
  const words = latex.replace(TEXT_COMMANDS, ' ').match(PROSE_WORD) ?? [];
  return words.length >= PROSE_WORD_THRESHOLD ? 'text' : 'math';
}
