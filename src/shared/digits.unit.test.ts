import { describe, expect, it } from 'vitest';

import { normalizeNumericInput, parseNumericInput, toLatinDigits } from './digits';

describe('numbers typed on an Arabic keyboard', () => {
  it('rewrites both Arabic-Indic digit ranges as the stored digits', () => {
    expect(toLatinDigits('٢٥٠')).toBe('250');
    expect(toLatinDigits('۴۵')).toBe('45');
    expect(toLatinDigits('١٢ قطعة')).toBe('12 قطعة');
  });

  it('accepts either decimal separator and drops thousands marks', () => {
    expect(normalizeNumericInput('١٢٣٤٫٥٠')).toBe('1234.50');
    expect(normalizeNumericInput('1٬234.5')).toBe('1234.5');
    expect(normalizeNumericInput('12,500')).toBe('12500');
  });

  it('keeps a single decimal point and a leading minus, and refuses the rest', () => {
    expect(normalizeNumericInput('-٣.١٤')).toBe('-3.14');
    expect(normalizeNumericInput('1.2.3')).toBe('1.23');
    expect(normalizeNumericInput('abc')).toBe('');
  });

  it('reads a value only once the field holds a whole number', () => {
    expect(parseNumericInput('٢٥')).toBe(25);
    expect(parseNumericInput('-')).toBeUndefined();
    expect(parseNumericInput('')).toBeUndefined();
    expect(parseNumericInput('.')).toBeUndefined();
  });
});
