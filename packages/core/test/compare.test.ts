import { describe, expect, it } from 'vitest';

import { compareLatex, editDistance, normalizeLatex, tokenizeLatex } from '../src/latex/compare.ts';

describe('tokenizeLatex', () => {
  it('splits control words, control symbols and characters', () => {
    expect(tokenizeLatex('\\frac{a}{b} \\, x')).toEqual([
      '\\frac',
      '{',
      'a',
      '}',
      '{',
      'b',
      '}',
      '\\,',
      'x',
    ]);
  });
});

describe('normalizeLatex', () => {
  it.each([
    ['x^{2}', 'x^2'],
    ['x_{i}', 'x_i'],
    ['\\left( x \\right)', '(x)'],
    ['\\left. f \\right|_{0}', 'f|_0'],
    ['\\dfrac{a}{b}', '\\frac{a}{b}'],
    ['a \\, b \\quad c', 'abc'],
    ['\\displaystyle \\sum_i x_i', '\\sum_i x_i'],
    ['E = mc^2.', 'E=mc^2'],
    ['$x \\le y$', 'x \\leq y'],
  ])('treats %j like %j', (a, b) => {
    expect(normalizeLatex(a)).toEqual(normalizeLatex(b));
  });

  it('keeps braces around multi-token scripts', () => {
    expect(normalizeLatex('x^{2n}')).toEqual(['x', '^', '{', '2', 'n', '}']);
  });

  it('drops the \\; spacing command but keeps a literal semicolon', () => {
    expect(normalizeLatex('a \\; b')).toEqual(['a', 'b']);
    expect(normalizeLatex('f(x; y)')).toEqual(['f', '(', 'x', ';', 'y', ')']);
  });

  it('keeps command boundaries that whitespace separated', () => {
    expect(normalizeLatex('\\alpha x')).not.toEqual(normalizeLatex('\\alphax'));
  });
});

describe('editDistance', () => {
  it.each([
    [[], [], 0],
    [['a'], [], 1],
    [['a', 'b', 'c'], ['a', 'b', 'c'], 0],
    [['a', 'b', 'c'], ['a', 'x', 'c'], 1],
    [['k', 'i', 't'], ['s', 'i', 't', 's'], 2],
  ])('distance(%j, %j) = %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
  });
});

describe('compareLatex', () => {
  it('scores a cosmetic difference as an exact and render match', () => {
    expect(compareLatex('\\frac{a}{b}^{2}', '\\frac{a}{b}^2')).toEqual({
      exactMatch: true,
      renderMatch: true,
      normalizedEditDistance: 0,
    });
  });

  it('catches source differences that render identically', () => {
    const result = compareLatex('{a}+b', 'a+b');
    expect(result.exactMatch).toBe(false);
    expect(result.renderMatch).toBe(true);
  });

  it('reports a wrong symbol as a partial miss', () => {
    const result = compareLatex('a+c', 'a+b');
    expect(result.exactMatch).toBe(false);
    expect(result.renderMatch).toBe(false);
    expect(result.normalizedEditDistance).toBeCloseTo(1 / 3);
  });

  it('never render-matches unparseable output', () => {
    expect(compareLatex('\\frac{a', '\\frac{a').renderMatch).toBe(false);
  });
});
