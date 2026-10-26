import { sanitizeModelOutput } from './sanitize.ts';
import { renderedSymbols } from './symbols.ts';

/** Commands that only change spacing or sizing and never change meaning. */
const DROPPED_COMMANDS = new Set([
  '\\displaystyle',
  '\\textstyle',
  '\\left',
  '\\right',
  '\\big',
  '\\Big',
  '\\bigg',
  '\\Bigg',
  '\\bigl',
  '\\bigr',
  '\\Bigl',
  '\\Bigr',
  '\\biggl',
  '\\biggr',
  '\\Biggl',
  '\\Biggr',
  '\\,',
  '\\;',
  '\\:',
  '\\!',
  '\\ ',
  '\\quad',
  '\\qquad',
  '~',
]);

const COMMAND_ALIASES: Readonly<Record<string, string>> = {
  '\\dfrac': '\\frac',
  '\\tfrac': '\\frac',
  '\\le': '\\leq',
  '\\ge': '\\geq',
  '\\ne': '\\neq',
  '\\to': '\\rightarrow',
};

const TRAILING_PUNCTUATION = new Set(['.', ',', ';']);

/**
 * Splits LaTeX into tokens: control words (`\frac`), control symbols (`\,`), and single
 * characters. Whitespace is discarded.
 */
export function tokenizeLatex(latex: string): string[] {
  const tokens: string[] = [];
  const pattern = /\\[a-zA-Z]+|\\[^a-zA-Z]|\S/g;
  for (const match of latex.matchAll(pattern)) tokens.push(match[0]);
  return tokens;
}

/**
 * Canonical token sequence used for exact-match scoring. Two snippets that differ only in
 * whitespace, delimiters, spacing commands, `\left`/`\right`, redundant braces around a
 * single sub/superscript token, or trailing punctuation normalize to the same tokens.
 */
export function normalizeLatex(latex: string): string[] {
  const tokens = tokenizeLatex(sanitizeModelOutput(latex))
    .map((token) => COMMAND_ALIASES[token] ?? token)
    .filter((token, i, all) => {
      // `\left.` and `\right.` are invisible delimiters; drop the dot along with the command.
      if (token === '.' && (all[i - 1] === '\\left' || all[i - 1] === '\\right')) return false;
      return !DROPPED_COMMANDS.has(token);
    });

  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    out.push(token);
    // x^{2} -> x^2, x_{i} -> x_i
    if ((token === '^' || token === '_') && tokens[i + 1] === '{' && tokens[i + 3] === '}') {
      const inner = tokens[i + 2];
      if (inner !== undefined && inner !== '{' && inner !== '}') {
        out.push(inner);
        i += 3;
      }
    }
  }

  while (out.length > 0 && TRAILING_PUNCTUATION.has(out[out.length - 1] ?? '')) out.pop();
  return out;
}

/** Levenshtein distance over token sequences. */
export function editDistance(a: readonly string[], b: readonly string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

export interface LatexComparison {
  /** Normalized LaTeX token sequences are identical (strict, source-level). */
  readonly exactMatch: boolean;
  /**
   * Both render to the same visible symbols and structure (see `renderedSymbols`).
   * Ignores fonts and layout wrappers. False if either side fails to render.
   */
  readonly symbolMatch: boolean;
  /** LaTeX token edit distance divided by reference length. 0 is perfect. */
  readonly tokenEditDistance: number;
  /**
   * Rendered-symbol edit distance divided by reference length; 1 if the prediction does
   * not render. 0 is perfect.
   */
  readonly symbolEditDistance: number;
}

export function compareLatex(prediction: string, reference: string): LatexComparison {
  const predictedTokens = normalizeLatex(prediction);
  const expectedTokens = normalizeLatex(reference);
  const predictedSymbols = renderedSymbols(prediction);
  const expectedSymbols = renderedSymbols(reference);

  const symbolEditDistance =
    predictedSymbols === null || expectedSymbols === null
      ? 1
      : editDistance(predictedSymbols, expectedSymbols) / Math.max(expectedSymbols.length, 1);

  return {
    exactMatch: predictedTokens.join(' ') === expectedTokens.join(' '),
    symbolMatch:
      predictedSymbols !== null &&
      expectedSymbols !== null &&
      predictedSymbols.join('\u0000') === expectedSymbols.join('\u0000'),
    tokenEditDistance:
      editDistance(predictedTokens, expectedTokens) / Math.max(expectedTokens.length, 1),
    symbolEditDistance,
  };
}
