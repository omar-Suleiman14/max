import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAppAsset } from './resolve-app-asset';

describe('packaged application asset resolution', () => {
  const rendererRoot = resolve('renderer-root');

  it('resolves application assets beneath the renderer root', () => {
    expect(resolveAppAsset(rendererRoot, 'max://app/')).toBe(join(rendererRoot, 'index.html'));
    expect(resolveAppAsset(rendererRoot, 'max://app/assets/max.js')).toBe(
      join(rendererRoot, 'assets', 'max.js'),
    );
  });

  it('rejects other hosts, schemes, malformed encoding, and traversal', () => {
    expect(resolveAppAsset(rendererRoot, 'max://other/index.html')).toBeUndefined();
    expect(resolveAppAsset(rendererRoot, 'https://app/index.html')).toBeUndefined();
    expect(resolveAppAsset(rendererRoot, 'max://app/%E0%A4%A')).toBeUndefined();
    expect(resolveAppAsset(rendererRoot, 'max://app/..%2fsecret')).toBeUndefined();
  });
});
