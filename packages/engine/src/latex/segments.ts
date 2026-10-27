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
  return scan(text)?.map(({ kind, content }) => ({ kind, content })) ?? null;
}

/** A segment plus its original text, delimiters included, so text can be rebuilt. */
interface ScannedSegment extends Segment {
  readonly raw: string;
}

function scan(text: string): ScannedSegment[] | null {
  const segments: ScannedSegment[] = [];
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
    if (prose !== '') segments.push({ kind: 'prose', content: prose, raw: prose });
    prose = '';
    segments.push({
      kind: 'math',
      content: text.slice(i + open.length, end),
      raw: text.slice(i, end + close.length),
    });
    i = end + close.length;
  }
  if (prose !== '') segments.push({ kind: 'prose', content: prose, raw: prose });
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

// Words inside \text{…} and similar belong to the math, not to surrounding prose, and so do
// command arguments such as the environment in \begin{aligned} or \end{pmatrix}.
const TEXT_COMMANDS = /\\(?:text\w*|mathrm|operatorname|mbox)\s*\{[^{}]*\}/g;
const COMMAND_ARGUMENTS = /\\[A-Za-z]+\*?\s*\{[A-Za-z*]+\}/g;
const PROSE_WORD = /(?<![\\A-Za-z])[A-Za-z]{3,}(?![A-Za-z])/g;
const PROSE_WORD_THRESHOLD = 4;

/**
 * `text` when the output marks math inside prose, or reads like sentences. Math rarely has
 * several bare words of three or more letters outside \text{…}; prose always does.
 */
export function classifyOutput(latex: string): OutputKind {
  const segments = splitMath(latex);
  if (segments?.some((segment) => segment.kind === 'math') === true) return 'text';
  const words =
    latex.replace(TEXT_COMMANDS, ' ').replace(COMMAND_ARGUMENTS, ' ').match(PROSE_WORD) ?? [];
  return words.length >= PROSE_WORD_THRESHOLD ? 'text' : 'math';
}

/**
 * Keeps a text snip's lines apart once pasted. LaTeX and Markdown both turn a single line
 * break into a space, which ran a formula sheet's lines together, so each line break in the
 * prose becomes a paragraph break. Math segments (a multi-line aligned block, say) are left
 * as they are.
 */
export function preserveLineBreaks(text: string): string {
  const segments = scan(text);
  if (segments === null) return text;
  // A LaTeX environment in the prose means this is really math; blank lines would break it.
  if (segments.some((s) => s.kind === 'prose' && s.raw.includes('\\begin{'))) return text;
  return segments
    .map((segment) =>
      segment.kind === 'math' ? segment.raw : segment.raw.replace(/[ \t]*\n[ \t\n]*/g, '\n\n'),
    )
    .join('')
    .trim();
}
