const CODE_FENCE = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/;

const DELIMITER_PAIRS: readonly (readonly [string, string])[] = [
  ['$$', '$$'],
  ['\\[', '\\]'],
  ['\\(', '\\)'],
  ['$', '$'],
];

/**
 * Turns raw model output into bare LaTeX: drops markdown code fences and one layer of
 * math delimiters. Inner content is left untouched.
 */
export function sanitizeModelOutput(raw: string): string {
  let text = raw.trim();

  const fenced = CODE_FENCE.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1].trim();

  for (const [open, close] of DELIMITER_PAIRS) {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, text.length - close.length).trim();
      break;
    }
  }

  return text;
}
