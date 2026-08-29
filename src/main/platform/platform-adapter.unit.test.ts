import { describe, expect, it } from 'vitest';

import { toSupportedPlatform } from './platform-adapter';

describe('platform adapter', () => {
  it.each([
    ['darwin', 'macos'],
    ['linux', 'linux'],
    ['win32', 'windows'],
  ] as const)('maps %s to %s', (nodePlatform, supportedPlatform) => {
    expect(toSupportedPlatform(nodePlatform)).toBe(supportedPlatform);
  });

  it('rejects unsupported operating systems', () => {
    expect(() => toSupportedPlatform('aix')).toThrow('Max does not support platform aix.');
  });
});
