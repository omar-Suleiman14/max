import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(fileURLToPath(new URL('../src/renderer/styles.css', import.meta.url)), 'utf8');

/**
 * A custom property the stylesheet reads but never sets, and reads without a
 * fallback, is invisible: the browser resolves it to nothing and drops the whole
 * declaration with no error. That is how `var(--primary)` left calendar record
 * pills as white text on a white cell and the today badge unreadable, and how
 * `var(--foreground)` left eight database rules with no colour at all.
 *
 * A usage that supplies a fallback is fine, and so is a property the renderer
 * sets from script, as long as every read of it names a fallback.
 */
describe('stylesheet custom properties', () => {
  it('defines every custom property it reads without a fallback', () => {
    const defined = new Set([...styles.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
    const read = [...styles.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)].map((match) => match[1]);
    const missing = [...new Set(read.filter((name) => !defined.has(name)))].sort();

    expect(missing).toEqual([]);
  });
});
