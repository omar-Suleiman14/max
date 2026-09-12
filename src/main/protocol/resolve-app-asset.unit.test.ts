import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAppAsset, resolveWorkspaceAsset } from './resolve-app-asset';

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

  it('serves stored images by their own name, and nothing else', () => {
    const assetRoot = resolve('asset-root');
    const name = `${'a'.repeat(64)}.png`;

    expect(resolveWorkspaceAsset(assetRoot, `max://asset/${name}`)).toBe(join(assetRoot, name));
    // Anything that is not a name the store wrote is simply not found: no
    // traversal, no neighbouring file, no request for the database itself.
    expect(resolveWorkspaceAsset(assetRoot, 'max://asset/../max.sqlite')).toBeUndefined();
    expect(resolveWorkspaceAsset(assetRoot, `max://asset/${'a'.repeat(64)}.svg`)).toBeUndefined();
    expect(resolveWorkspaceAsset(assetRoot, 'max://asset/photo.png')).toBeUndefined();
    expect(resolveWorkspaceAsset(assetRoot, 'max://app/index.html')).toBeUndefined();
  });
});
