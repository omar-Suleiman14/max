import { describe, expect, it } from 'vitest';
import { generateInitialOrderKeys, generateOrderKey } from './order-key';

describe('order-key utility', () => {
  it('generates a default middle key when no keys are provided', () => {
    const key = generateOrderKey();
    expect(key).toBe('a0');
  });

  it('generates a key smaller than nextKey when only nextKey is provided', () => {
    const next = 'a0';
    const key = generateOrderKey(null, next);
    expect(key < next).toBe(true);
  });

  it('generates a key larger than prevKey when only prevKey is provided', () => {
    const prev = 'a0';
    const key = generateOrderKey(prev, null);
    expect(key > prev).toBe(true);
  });

  it('generates intermediate keys between two keys', () => {
    const first = 'a0';
    const last = 'z0';
    const middle = generateOrderKey(first, last);
    expect(middle > first).toBe(true);
    expect(middle < last).toBe(true);
  });

  it('supports repeated insertions between adjacent keys without crashing or reordering', () => {
    let left = 'a0';
    const right = 'a1';
    for (let i = 0; i < 20; i++) {
      const mid = generateOrderKey(left, right);
      expect(mid > left).toBe(true);
      expect(mid < right).toBe(true);
      left = mid;
    }
  });

  it('generates N distinct ascending initial keys', () => {
    const keys = generateInitialOrderKeys(10);
    expect(keys).toHaveLength(10);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]! > keys[i - 1]!).toBe(true);
    }
  });
});
