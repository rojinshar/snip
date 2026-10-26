import katex from 'katex';

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
