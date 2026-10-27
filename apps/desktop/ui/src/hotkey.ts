/** The parts of a KeyboardEvent a hotkey is built from. */
export interface KeyPress {
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const MODIFIER_CODES = new Set([
  'MetaLeft',
  'MetaRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'CapsLock',
  'Fn',
]);

/**
 * Turns a key press into the hotkey syntax the app parses, e.g. "Cmd+Shift+Digit2". Uses the
 * physical key (`code`), so ⌥ combinations record the key, not the special character they
 * type. Returns null while only modifiers are held. Rust validates the result.
 */
export function hotkeyFromKeyPress(press: KeyPress): string | null {
  if (press.code === '' || MODIFIER_CODES.has(press.code)) return null;
  const parts: string[] = [];
  if (press.metaKey) parts.push('Cmd');
  if (press.ctrlKey) parts.push('Ctrl');
  if (press.altKey) parts.push('Alt');
  if (press.shiftKey) parts.push('Shift');
  parts.push(press.code);
  return parts.join('+');
}

const MODIFIER_SYMBOLS: readonly (readonly [symbol: string, names: readonly string[]])[] = [
  ['⌃', ['ctrl', 'control']],
  ['⌥', ['alt', 'option']],
  ['⇧', ['shift']],
  ['⌘', ['cmd', 'command', 'super', 'meta']],
];

const KEY_LABELS: Readonly<Record<string, string>> = {
  Space: 'Space',
  Enter: '↩',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** Formats a hotkey the way macOS menus do: "Cmd+Shift+Digit2" → "⇧⌘2". */
export function formatHotkey(hotkey: string): string {
  const parts = hotkey.split('+');
  const key = parts.pop() ?? '';
  const held = new Set(parts.map((part) => part.toLowerCase()));
  const modifiers = MODIFIER_SYMBOLS.filter(([, names]) => names.some((name) => held.has(name)))
    .map(([symbol]) => symbol)
    .join('');
  return modifiers + keyLabel(key);
}

function keyLabel(code: string): string {
  const named = KEY_LABELS[code];
  if (named !== undefined) return named;
  const match = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(\d)$/.exec(code);
  return match?.[1] ?? code;
}
