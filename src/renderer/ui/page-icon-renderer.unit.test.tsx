// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageIconRenderer } from './page-icon-renderer';

afterEach(() => cleanup());

describe('PageIconRenderer', () => {
  it('draws a bundled glyph', () => {
    const { container } = render(<PageIconRenderer icon="lucide:Info" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  it('falls back to a glyph when the named one is not bundled', () => {
    // The registry is a curated subset of Lucide. A callout saved with
    // `lucide:Lightbulb` — a name this build does not bundle — used to print
    // that string beside the text instead of drawing anything.
    const { container } = render(<PageIconRenderer fallback="lucide:Info" icon="lucide:Lightbulb" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent).not.toContain('lucide:');
  });

  it('shows an emoji icon as itself', () => {
    const { container } = render(<PageIconRenderer icon="📦" />);

    expect(container.textContent).toBe('📦');
  });
});
