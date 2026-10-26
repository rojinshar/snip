import { describe, expect, it } from 'vitest';

import { validateLatex } from '../src/latex/validate.ts';

describe('validateLatex', () => {
  it.each([
    '\\frac{a}{b}',
    '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
    '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}',
    '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}',
  ])('accepts %s', (latex) => {
    expect(validateLatex(latex)).toEqual({ ok: true });
  });

  it.each(['\\frac{a}{b', '\\notacommand{x}', '\\begin{aligned} a \\end{matrix}'])(
    'rejects %s',
    (latex) => {
      const result = validateLatex(latex);
      expect(result.ok).toBe(false);
    },
  );

  it('rejects empty output', () => {
    expect(validateLatex('   ')).toEqual({ ok: false, error: 'empty output' });
  });
});
