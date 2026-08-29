import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..', '..');

describe('Sprint 1 shell contract', () => {
  it('keeps reduced-motion behavior in the shared design system', () => {
    const styles = readFileSync(resolve(projectRoot, 'src/renderer/styles.css'), 'utf8');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('animation-duration: 0.001ms !important');
  });

  it('uses logical direction-aware CSS instead of language-specific layout branches', () => {
    const styles = readFileSync(resolve(projectRoot, 'src/renderer/styles.css'), 'utf8');
    expect(styles).toContain('inset-inline-end');
    expect(styles).toContain('border-inline-end');
    expect(styles).not.toMatch(/margin-(left|right):/);
  });
});
