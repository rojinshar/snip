import { describe, expect, it } from 'vitest';

import { renderedSymbols } from '../src/latex/symbols.ts';

function same(a: string, b: string): void {
  expect(renderedSymbols(a)).toEqual(renderedSymbols(b));
}

function different(a: string, b: string): void {
  expect(renderedSymbols(a)).not.toEqual(renderedSymbols(b));
}

describe('renderedSymbols', () => {
  it('extracts visible characters and structure', () => {
    expect(renderedSymbols('x^2 + 1')).toEqual(['<msup>', 'x', '2', '</msup>', '+', '1']);
  });

  // Each pair below is a real UniMER label vs a Gemini prediction that a reader would accept.
  it.each([
    [
      '\\begin{array}{rl} a & = b \\\\ & = c \\end{array}',
      '\\begin{aligned} a &= b \\\\ &= c \\end{aligned}',
    ],
    ['1 6 . 4 \\mathrm { m }', '16.4\\text{m}'],
    ['\\operatorname * { d e t } g', '\\det g'],
    ['{ \\frac { 1 6 } { 6 4 } }', '\\frac{16}{64}'],
    ['\\left( 2 \\mathrm { A P } ^ { + } \\right)', '(2\\mathrm{AP}^{+})'],
    ['P _ { 1 } = C _ { N } ^ { \\prime }', "P_1 = C'_N"],
  ])('treats %j and %j as the same rendering', (a, b) => {
    same(a, b);
  });

  it.each([
    ['x^2', 'x2'],
    ['\\frac{a}{b}', 'a/b'],
    ['x_2 = -\\frac{1}{4}', 'x_2 = -1'],
    ['\\sqrt{x}', 'x'],
  ])('distinguishes %j from %j', (a, b) => {
    different(a, b);
  });

  it('ignores fonts, by design', () => {
    same('\\mathfrak{g}', 'g');
  });

  it('decodes escaped operators', () => {
    expect(renderedSymbols('a < b')).toEqual(['a', '<', 'b']);
  });

  it('returns null when KaTeX cannot render', () => {
    expect(renderedSymbols('\\frac{a')).toBeNull();
  });
});
