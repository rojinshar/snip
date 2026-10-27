import { describe, expect, it } from 'vitest';

import { validateLatex, validateOutput } from '../src/latex/validate.ts';

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

describe('validateOutput', () => {
  it('accepts bare LaTeX that renders and rejects LaTeX that does not', () => {
    expect(validateOutput('\\frac{a}{b}')).toEqual({ ok: true });
    expect(validateOutput('\\frac{a')).toMatchObject({ ok: false });
  });

  it('accepts text whose math segments all render', () => {
    expect(validateOutput('The roots are $x=\\frac{1}{2}$, where $a\\neq0$.')).toEqual({
      ok: true,
    });
  });

  it('rejects text with a math segment that does not render', () => {
    expect(validateOutput('The roots are $x=\\frac{1}{2$ here.')).toMatchObject({ ok: false });
  });

  it('rejects text with an unclosed delimiter', () => {
    expect(validateOutput('The roots are $x=1 and so on for many words')).toMatchObject({
      ok: false,
    });
  });

  it('accepts prose without delimiters, which has no math to check', () => {
    expect(validateOutput('Let f be continuous. Then the area under the curve exists.')).toEqual({
      ok: true,
    });
  });
});
