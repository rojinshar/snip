import katex from 'katex';

import { classifyOutput, splitMath } from './segments.ts';

export type ValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Checks that the LaTeX parses and renders with KaTeX. This is the gate every snip must
 * pass before it reaches the user's clipboard.
 */
export function validateLatex(latex: string): ValidationResult {
  if (latex.trim() === '') return { ok: false, error: 'empty output' };
  try {
    katex.renderToString(latex, { displayMode: true, throwOnError: true, strict: 'ignore' });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The gate for model output, math or text (see segments.ts). Math must render as a whole.
 * Text must have balanced delimiters and every math segment must render; its prose is not
 * checked.
 */
export function validateOutput(output: string): ValidationResult {
  if (classifyOutput(output) === 'math') return validateLatex(output);
  const segments = splitMath(output);
  if (segments === null) return { ok: false, error: 'unclosed math delimiter' };
  for (const segment of segments) {
    if (segment.kind !== 'math') continue;
    const result = validateLatex(segment.content);
    if (!result.ok) return { ok: false, error: `in $${segment.content}$: ${result.error}` };
  }
  return { ok: true };
}
