import type { ForgeConfig } from '@electron-forge/shared-types';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { join } from 'node:path';

const linuxMakers: NonNullable<ForgeConfig['makers']> = [
  {
    name: '@electron-forge/maker-deb',
    config: {
      options: {
        categories: ['Office'],
        description: 'Offline-first configurable shop operating system',
        genericName: 'Shop operating system',
      },
    },
  },
];

if (process.env.MAX_ENABLE_FLATPAK === '1') {
  linuxMakers.push({
    name: '@electron-forge/maker-flatpak',
    config: {
      options: {
        categories: ['Office'],
        id: 'com.maxshop.Max',
      },
    },
  });
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    electronZipDir: join(__dirname, '.cache', 'electron-zips'),
    executableName: 'max',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        authors: 'Max',
        description: 'Offline-first configurable shop operating system',
        name: 'Max',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
      config: {},
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {},
    },
    ...linuxMakers,
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
