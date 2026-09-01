/**
 * Lexicographical fractional indexing utility for deterministic, single-record position updates.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const MID_CHAR = 'V'; // base-62 midpoint ~ 31

function getCharIndex(char: string): number {
  const index = DIGITS.indexOf(char);
  if (index === -1) {
    throw new Error(`Invalid order key character: ${char}`);
  }
  return index;
}

export function generateOrderKey(prevKey?: string | null, nextKey?: string | null): string {
  const prev = prevKey?.trim() || '';
  const next = nextKey?.trim() || '';

  if (!prev && !next) {
    return 'a0';
  }

  if (!prev && next) {
    // Generate a key strictly smaller than next
    let i = 0;
    while (i < next.length && next[i] === '0') {
      i++;
    }
    if (i === next.length) {
      return '0' + MID_CHAR;
    }
    const val = getCharIndex(next[i]!);
    if (val > 1) {
      const midVal = Math.floor(val / 2);
      return next.slice(0, i) + DIGITS[midVal];
    }
    return next.slice(0, i) + '0' + MID_CHAR;
  }

  if (prev && !next) {
    // Generate a key strictly larger than prev
    for (let i = prev.length - 1; i >= 0; i--) {
      const val = getCharIndex(prev[i]!);
      if (val < BASE - 1) {
        const midVal = Math.floor((val + BASE) / 2);
        return prev.slice(0, i) + DIGITS[midVal];
      }
    }
    return prev + MID_CHAR;
  }

  if (prev >= next) {
    return prev + MID_CHAR;
  }

  // Both prev and next exist, prev < next
  let i = 0;
  while (i < prev.length && i < next.length && prev[i] === next[i]) {
    i++;
  }

  const pVal = i < prev.length ? getCharIndex(prev[i]!) : 0;
  const nVal = i < next.length ? getCharIndex(next[i]!) : BASE;

  if (nVal - pVal > 1) {
    const midVal = Math.floor((pVal + nVal) / 2);
    return prev.slice(0, i) + DIGITS[midVal];
  }

  // Adjacent characters (nVal - pVal === 1) or prev is prefix of next
  return prev + MID_CHAR;
}

export function generateInitialOrderKeys(count: number): string[] {
  const keys: string[] = [];
  let current: string | null = null;
  for (let i = 0; i < count; i++) {
    current = generateOrderKey(current, null);
    keys.push(current);
  }
  return keys;
}
