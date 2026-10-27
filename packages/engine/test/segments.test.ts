import { describe, expect, it } from 'vitest';

import { classifyOutput, splitMath } from '../src/latex/segments.ts';

describe('splitMath', () => {
  it('splits prose from inline and display math', () => {
    expect(splitMath('Roots are $x=1$ and $$y=2$$.')).toEqual([
      { kind: 'prose', content: 'Roots are ' },
      { kind: 'math', content: 'x=1' },
      { kind: 'prose', content: ' and ' },
      { kind: 'math', content: 'y=2' },
      { kind: 'prose', content: '.' },
    ]);
  });

  it('understands \\( \\) and \\[ \\] delimiters', () => {
    expect(splitMath('if \\(a>0\\) then \\[b\\]')).toEqual([
      { kind: 'prose', content: 'if ' },
      { kind: 'math', content: 'a>0' },
      { kind: 'prose', content: ' then ' },
      { kind: 'math', content: 'b' },
    ]);
  });

  it('treats \\$ as a literal dollar sign', () => {
    expect(splitMath('costs \\$5 or $x$')).toEqual([
      { kind: 'prose', content: 'costs \\$5 or ' },
      { kind: 'math', content: 'x' },
    ]);
  });

  it('returns null for an unclosed delimiter', () => {
    expect(splitMath('broken $x + 1')).toBeNull();
  });

  it('returns pure LaTeX as one prose segment', () => {
    expect(splitMath('\\frac{a}{b}')).toEqual([{ kind: 'prose', content: '\\frac{a}{b}' }]);
  });
});

describe('classifyOutput', () => {
  it.each([
    ['\\sum_{n=1}^\\infty \\frac{1}{n^2} = \\frac{\\pi^2}{6}'],
    ['\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}'],
    ['f(x) = \\sin x + \\cos x, \\quad x \\in \\mathbb{R}'],
    ['x > 0 \\text{ for all real numbers } x'],
    ['\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'],
  ])('math: %s', (latex) => {
    expect(classifyOutput(latex)).toBe('math');
  });

  it.each([
    ['The roots are $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$, where $a\\neq0$.'],
    ['\\textbf{Theorem.} For every $\\varepsilon > 0$ there exists $\\delta > 0$.'],
    ['Let f(x) = x^2. Then the area under the curve is one third.'],
  ])('text: %s', (latex) => {
    expect(classifyOutput(latex)).toBe('text');
  });
});
