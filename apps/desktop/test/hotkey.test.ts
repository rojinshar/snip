import { describe, expect, it } from 'vitest';

import { type KeyPress, formatHotkey, hotkeyFromKeyPress } from '../ui/src/hotkey.ts';

const press = (code: string, mods: Partial<Omit<KeyPress, 'code'>> = {}): KeyPress => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('hotkeyFromKeyPress', () => {
  it('builds the hotkey from the held modifiers and the physical key', () => {
    expect(hotkeyFromKeyPress(press('Digit2', { metaKey: true, shiftKey: true }))).toBe(
      'Cmd+Shift+Digit2',
    );
    expect(
      hotkeyFromKeyPress(
        press('KeyL', { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }),
      ),
    ).toBe('Cmd+Ctrl+Alt+Shift+KeyL');
  });

  it('waits while only modifiers are held', () => {
    expect(hotkeyFromKeyPress(press('MetaLeft', { metaKey: true }))).toBeNull();
    expect(hotkeyFromKeyPress(press('ShiftRight', { shiftKey: true }))).toBeNull();
    expect(hotkeyFromKeyPress(press(''))).toBeNull();
  });

  it('leaves modifier rules to the app, which reports why a hotkey is rejected', () => {
    expect(hotkeyFromKeyPress(press('KeyA'))).toBe('KeyA');
  });
});

describe('formatHotkey', () => {
  it('uses macOS menu symbols in macOS order', () => {
    expect(formatHotkey('Cmd+Shift+Digit2')).toBe('⇧⌘2');
    expect(formatHotkey('Cmd+Ctrl+Alt+Shift+KeyL')).toBe('⌃⌥⇧⌘L');
  });

  it('labels punctuation, arrows and named keys', () => {
    expect(formatHotkey('Alt+Space')).toBe('⌥Space');
    expect(formatHotkey('Ctrl+Slash')).toBe('⌃/');
    expect(formatHotkey('Cmd+ArrowUp')).toBe('⌘↑');
    expect(formatHotkey('Cmd+Numpad5')).toBe('⌘5');
    expect(formatHotkey('Cmd+F5')).toBe('⌘F5');
  });

  it('accepts the modifier spellings the app accepts', () => {
    expect(formatHotkey('command+option+KeyK')).toBe('⌥⌘K');
  });
});
