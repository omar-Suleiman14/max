import { type InputHTMLAttributes } from 'react';

import { normalizeNumericInput } from '../../shared/digits';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & Readonly<{
  /** The normalized text, so a half-typed "12." survives until it is finished. */
  onValueChange: (value: string) => void;
  value: string;
}>;

/**
 * A numeric field that accepts Arabic-Indic digits.
 *
 * It is a text field rather than `type="number"` on purpose: a number input
 * discards ٠١٢٣ and ٫ outright, so an Arabic keyboard could not enter a price
 * at all. `inputMode` still brings up the numeric keypad, and the spin buttons
 * were already hidden everywhere they appeared.
 */
export function NumberInput({ onValueChange, value, ...props }: NumberInputProps) {
  return (
    <input
      {...props}
      inputMode="decimal"
      onChange={(event) => onValueChange(normalizeNumericInput(event.target.value))}
      type="text"
      value={value}
    />
  );
}
