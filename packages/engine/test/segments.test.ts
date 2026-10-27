import { describe, expect, it } from 'vitest';

import { classifyOutput, preserveLineBreaks, splitMath } from '../src/latex/segments.ts';

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
    // Environment names are not prose words.
    [
      '\\begin{aligned} f(x) &= \\begin{cases} 1, & x > 0 \\\\ 0, & x \\le 0 \\end{cases} \\\\ \\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} &= ad - bc \\end{aligned}',
    ],
    ['\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} \\begin{vmatrix} x \\end{vmatrix}'],
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

describe('preserveLineBreaks', () => {
  it('turns each line break in prose into a paragraph break, so lines stay apart', () => {
    expect(preserveLineBreaks('Basic Values: $\\log_a 1 = 0$\n$\\log_a a = 1$\nTitle')).toBe(
      'Basic Values: $\\log_a 1 = 0$\n\n$\\log_a a = 1$\n\nTitle',
    );
  });

  it('keeps existing blank lines as one paragraph break', () => {
    expect(preserveLineBreaks('A\n\n\nB\n  \nC')).toBe('A\n\nB\n\nC');
  });

  it('leaves line breaks inside math alone', () => {
    const text = 'Then\n$$\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}$$\ndone';
    expect(preserveLineBreaks(text)).toBe(
      'Then\n\n$$\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}$$\n\ndone',
    );
  });

  it('never adds blank lines to a LaTeX environment outside $…$', () => {
    const block = '\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}';
    expect(preserveLineBreaks(block)).toBe(block);
  });

  it('returns text with an unclosed delimiter unchanged', () => {
    expect(preserveLineBreaks('a\n$b')).toBe('a\n$b');
  });
});
