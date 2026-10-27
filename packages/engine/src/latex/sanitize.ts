const CODE_FENCE = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/;

const DELIMITER_PAIRS: readonly (readonly [string, string])[] = [
  ['$$', '$$'],
  ['\\[', '\\]'],
  ['\\(', '\\)'],
  ['$', '$'],
];

/**
 * Cleans raw model output: drops markdown code fences and, when the whole output is one
 * delimited formula, that layer of delimiters. Text with several formulas is left as is.
 */
export function sanitizeModelOutput(raw: string): string {
  let text = raw.trim();

  const fenced = CODE_FENCE.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1].trim();

  for (const [open, close] of DELIMITER_PAIRS) {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length);
      // "$a$ and $b$" is text with two formulas, not one formula to unwrap.
      if (containsDelimiter(inner)) break;
      text = inner.trim();
      break;
    }
  }

  return text;
}

function containsDelimiter(text: string): boolean {
  return /(?<!\\)\$|\\[([)\]]/.test(text);
}
