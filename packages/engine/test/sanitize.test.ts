import { describe, expect, it } from 'vitest';

import { sanitizeModelOutput } from '../src/latex/sanitize.ts';

describe('sanitizeModelOutput', () => {
  it.each([
    ['x^2', 'x^2'],
    ['  x^2  ', 'x^2'],
    ['$x^2$', 'x^2'],
    ['$$x^2$$', 'x^2'],
    ['\\[x^2\\]', 'x^2'],
    ['\\(x^2\\)', 'x^2'],
    ['```latex\nx^2\n```', 'x^2'],
    ['```\n$$x^2$$\n```', 'x^2'],
  ])('turns %j into %j', (input, expected) => {
    expect(sanitizeModelOutput(input)).toBe(expected);
  });

  it('removes only one layer of delimiters', () => {
    expect(sanitizeModelOutput('$a$ and $b$')).toBe('a$ and $b');
  });

  it('leaves a lone dollar sign alone', () => {
    expect(sanitizeModelOutput('$')).toBe('$');
  });
});
