import { describe, expect, it } from 'vitest';

import { localeDigit, matchesShortcut, shortcutDigit, shortcutKey } from './keyboard';

describe('shortcuts on an Arabic layout', () => {
  it('reads the letter printed on the keycap, not the one the layout produces', () => {
    // Ctrl+F and Ctrl+S on an Arabic layout arrive as "ب" and "س".
    expect(shortcutKey({ code: 'KeyF', key: 'ب' })).toBe('f');
    expect(matchesShortcut({ code: 'KeyF', key: 'ب' }, 'f')).toBe(true);
    expect(matchesShortcut({ code: 'KeyS', key: 'س' }, 's')).toBe(true);
    expect(matchesShortcut({ code: 'KeyS', key: 'س' }, 'g')).toBe(false);
  });

  it('keeps matching on Latin layouts, including when no code is reported', () => {
    expect(matchesShortcut({ code: 'KeyG', key: 'g' }, 'g')).toBe(true);
    expect(matchesShortcut({ key: 'G' }, 'g')).toBe(true);
    expect(matchesShortcut({ key: ',' }, ',')).toBe(true);
  });

  it('matches punctuation shortcuts by their physical key', () => {
    // The comma keycap carries "و" in Arabic, and the slash carries "ز".
    expect(matchesShortcut({ code: 'Comma', key: 'و' }, ',')).toBe(true);
    expect(matchesShortcut({ code: 'Slash', key: 'ز' }, '/')).toBe(true);
  });

  it('accepts Arabic-Indic numerals as the digits they are', () => {
    expect(shortcutDigit({ code: 'Digit3', key: '٣' })).toBe(3);
    expect(shortcutDigit({ key: '٧' })).toBe(7);
    expect(shortcutDigit({ key: '۹' })).toBe(9);
    expect(shortcutDigit({ code: 'Numpad1', key: '1' })).toBe(1);
    expect(shortcutDigit({ code: 'KeyA', key: 'ش' })).toBeNull();
  });

  it('prints keycap hints in the numerals the reader uses', () => {
    expect(localeDigit(4, 'ar')).toBe('٤');
    expect(localeDigit(4, 'en')).toBe('4');
  });
});
