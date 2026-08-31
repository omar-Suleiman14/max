const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { join } = require('node:path');

const linuxMakers = [
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

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    asar: true,
    electronZipDir: join(__dirname, '.cache', 'electron-zips'),
    executableName: process.platform === 'linux' ? 'max-shop-os' : 'max',
    ignore: [
      /^\/(?:\.cache|\.npm-cache|artifacts|backups|out)(?:\/|$)/,
      /^\/\.env(?:\.|$)/,
      /^\/(?:\.github|docs|scripts|src|worker)(?:\/|$)/,
      /^\/node_modules\/(?:\.cache|\.vite)(?:\/|$)/,
      /^\/node_modules\/\.package-lock\.json$/,
      /^\/(?:AGENTS\.md|README\.md|eslint\.config\.mjs|forge\.config\.cjs|index\.html|tsconfig[^/]*|vite\.[^/]*|vitest\.[^/]*)$/,
      /^\/(?:\.editorconfig|\.gitattributes|\.gitignore|\.npmrc|\.nvmrc)$/,
    ],
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
          config: 'vite.main.config.mjs',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mjs',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Forge 6 uses a packager generation that does not embed the Windows PE
      // ASAR integrity resource required by Electron 44. Keep the app ASAR-only
      // and disable this fuse so the signed executable remains launchable.
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

module.exports = config;
