/**
 * Arabic-Indic digits, written back as the digits Max stores.
 *
 * An Arabic keyboard layout produces ٠١٢٣ rather than 0123, and the Arabic
 * decimal separator is ٫ rather than a full stop. A browser `number` input
 * silently discards all of them, so typing a price in Arabic filled the field
 * with nothing and the form looked broken. Numeric fields therefore take text
 * and pass it through here, which is also what lets the same field accept a
 * number pasted from a receipt in either script.
 */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

export function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    const zero = code >= EXTENDED_ARABIC_INDIC_ZERO ? EXTENDED_ARABIC_INDIC_ZERO : ARABIC_INDIC_ZERO;
    return String(code - zero);
  });
}

/**
 * What a numeric field keeps from what was typed: digits in either script, one
 * decimal point in either script, and a leading minus. Everything else is
 * dropped as it is typed rather than accepted and rejected on submit.
 */
export function normalizeNumericInput(value: string): string {
  const latin = toLatinDigits(value)
    .replace(/\u066b/g, '.')
    // Thousands marks in either script, plus the spaces used for grouping.
    .replace(/[\u066c,\s\u00a0\u202f]/g, '');
  const negative = latin.trimStart().startsWith('-');
  const [whole = '', ...rest] = latin.replace(/[^0-9.]/g, '').split('.');
  const decimals = rest.join('');
  return `${negative ? '-' : ''}${whole}${rest.length ? `.${decimals}` : ''}`;
}

/** The number a normalized field holds, or undefined while it is incomplete. */
export function parseNumericInput(value: string): number | undefined {
  const normalized = normalizeNumericInput(value);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
