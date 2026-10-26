import katex from 'katex';

import { sanitizeModelOutput } from './sanitize.ts';

/** MathML elements whose nesting changes meaning; kept as open/close tokens. */
const STRUCTURAL_ELEMENTS = new Set([
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'msqrt',
  'mroot',
  'mover',
  'munder',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
]);

/** Elements whose text content is what the reader sees. */
const LEAF_ELEMENTS = new Set(['mi', 'mn', 'mo', 'mtext', 'ms']);

/** Invisible operators KaTeX inserts (function application, invisible times/separator/plus). */
const INVISIBLE_CHARACTERS = /[\u2061-\u2064\u200b\u00a0\s]/u;

const ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#x27;': "'",
};

const TAG_OR_TEXT = /<(\/?)([a-zA-Z]+)[^>]*?(\/?)>|([^<]+)/g;

/**
 * Turns LaTeX into the sequence of things KaTeX actually draws: visible characters plus
 * open/close markers for meaning-bearing structure (scripts, fractions, roots, tables).
 * Layout wrappers, styling attributes and fonts are ignored, so `\begin{array}` vs
 * `\begin{aligned}`, `\mathrm{m}` vs `\text{m}` and `\operatorname*{det}` vs `\det` produce
 * the same symbols, while `x^2` vs `x2` do not. Returns null if KaTeX cannot render it.
 */
export function renderedSymbols(latex: string): string[] | null {
  let mathml: string;
  try {
    mathml = katex.renderToString(sanitizeModelOutput(latex), {
      displayMode: true,
      output: 'mathml',
      throwOnError: true,
      strict: 'ignore',
    });
  } catch {
    return null;
  }

  const symbols: string[] = [];
  let leafDepth = 0;
  for (const match of mathml
    .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
    .matchAll(TAG_OR_TEXT)) {
    const [, closing, element, selfClosing, text] = match;
    if (text !== undefined) {
      if (leafDepth === 0) continue;
      for (const char of decodeEntities(text)) {
        if (!INVISIBLE_CHARACTERS.test(char)) symbols.push(char);
      }
      continue;
    }

    const name = element?.toLowerCase() ?? '';
    if (LEAF_ELEMENTS.has(name)) {
      if (selfClosing) continue;
      leafDepth += closing ? -1 : 1;
    } else if (STRUCTURAL_ELEMENTS.has(name) && !selfClosing) {
      symbols.push(closing ? `</${name}>` : `<${name}>`);
    }
  }
  return symbols;
}

function decodeEntities(text: string): string {
  return text.replace(/&[#\w]+;/g, (entity) => ENTITIES[entity] ?? entity);
}
