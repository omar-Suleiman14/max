import type { SystemHealth } from '../../shared/ipc-contract';

export type SupportedPlatform = SystemHealth['runtime']['platform'];

export type PlatformAdapter = Readonly<{
  arch: string;
  platform: SupportedPlatform;
}>;

export function toSupportedPlatform(nodePlatform: NodeJS.Platform): SupportedPlatform {
  const platformByNodePlatform: Partial<Record<NodeJS.Platform, SupportedPlatform>> = {
    darwin: 'macos',
    linux: 'linux',
    win32: 'windows',
  };
  const platform = platformByNodePlatform[nodePlatform];

  if (!platform) {
    throw new Error(`Max does not support platform ${nodePlatform}.`);
  }

  return platform;
}

export function getPlatformAdapter(): PlatformAdapter {
  return Object.freeze({
    arch: process.arch,
    platform: toSupportedPlatform(process.platform),
  });
}
