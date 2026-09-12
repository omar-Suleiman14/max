/**
 * Layout-independent shortcut matching.
 *
 * `KeyboardEvent.key` reports the character the active keyboard layout produces,
 * so on an Arabic layout Ctrl+F arrives as "ب" and Ctrl+S as "س". Shortcuts are
 * advertised by the letter printed on the keycap, so they are matched against
 * `KeyboardEvent.code` (the physical key) as well as `key`. Matching either one
 * keeps Latin layouts working unchanged while making the same physical keys fire
 * the same commands in Arabic.
 */

type ShortcutEvent = Readonly<{ code?: string; key: string }>;

const punctuationCodes: Readonly<Record<string, string>> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
};

/** The Latin character a physical key carries, independent of the active layout. */
export function shortcutKey(event: ShortcutEvent): string {
  const code = event.code ?? '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^(?:Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
  return punctuationCodes[code] ?? event.key.toLowerCase();
}

/** True when `expected` (a lowercase Latin character) is on the pressed key. */
export function matchesShortcut(event: ShortcutEvent, expected: string): boolean {
  return shortcutKey(event) === expected || event.key.toLowerCase() === expected;
}

// Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits, which Arabic layouts
// and numeric keypads under some locales produce instead of ASCII digits.
const arabicIndicDigits = /^[٠-٩۰-۹]$/;

/**
 * The digit on the pressed key, or `null` when the key is not a digit. Accepts
 * Arabic-Indic numerals so "press 1–9" works on an Arabic keyboard too.
 */
export function shortcutDigit(event: ShortcutEvent): number | null {
  const code = event.code ?? '';
  if (/^(?:Digit|Numpad)[0-9]$/.test(code)) return Number(code.slice(-1));
  if (/^[0-9]$/.test(event.key)) return Number(event.key);
  if (arabicIndicDigits.test(event.key)) return event.key.codePointAt(0)! % 16;
  return null;
}

/** Render a digit in the reader's own numerals so the keycap hint matches. */
export function localeDigit(value: number, locale: string): string {
  return locale === 'ar' ? String.fromCodePoint(0x0660 + value) : String(value);
}
