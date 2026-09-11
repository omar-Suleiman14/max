const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { readdir, rm } = require('node:fs/promises');
const { join } = require('node:path');

function trimElectronLocales(buildPath, _electronVersion, platform, _arch, callback) {
  const localeDirectories = platform === 'darwin'
    ? [
        join(buildPath, 'Electron.app', 'Contents', 'Resources'),
        join(buildPath, 'Electron.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources'),
      ]
    : [join(buildPath, 'locales')];
  const keepLocale = platform === 'darwin'
    ? (name) => name === 'ar.lproj' || name.startsWith('ar_') || name === 'en.lproj' || name.startsWith('en_')
    : (name) => name === 'ar.pak' || name === 'en-US.pak';

  void Promise.all(localeDirectories.map(async (localeDirectory) => {
    const entries = await readdir(localeDirectory, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => platform === 'darwin' ? entry.isDirectory() && entry.name.endsWith('.lproj') : entry.isFile() && entry.name.endsWith('.pak'))
      .filter((entry) => !keepLocale(entry.name))
      .map((entry) => rm(join(localeDirectory, entry.name), { force: true, recursive: entry.isDirectory() })));
  }))
    .then(() => callback())
    .catch((error) => callback(error));
}

const linuxMakers = [
  {
    name: '@electron-forge/maker-deb',
    config: {
      options: {
        categories: ['Office'],
        icon: join(__dirname, 'assets', 'max.png'),
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
    afterExtract: [trimElectronLocales],
    asar: true,
    icon: join(__dirname, 'assets', 'max'),
    electronZipDir: join(__dirname, '.cache', 'electron-zips'),
    executableName: process.platform === 'linux' ? 'max-shop-os' : 'max',
    // Runtime dependencies are bundled by Vite. Ship only the app payload,
    // never downloaded releases, workspace files, scratch scripts, or build logs.
    ignore: [/^\/(?!(?:\.vite|assets)(?:\/|$)|package\.json$)/],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        authors: 'Max',
        description: 'Offline-first configurable shop operating system',
        name: 'Max',
        setupIcon: join(__dirname, 'assets', 'max.ico'),
        // Squirrel downloads this icon and points the Installed apps entry at
        // it. electron-winstaller otherwise defaults to Electron's own icon,
        // which is what Windows then shows next to Max in Settings.
        iconUrl: 'https://raw.githubusercontent.com/omar-Suleiman14/max/main/assets/max.ico',
        // Windows SmartScreen warns about unsigned installers. Supply an
        // Authenticode certificate through the environment to sign the build;
        // without one the installer is produced unsigned, as before.
        ...(process.env.WINDOWS_CERTIFICATE_FILE
          ? {
            certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
            certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
          }
          : {}),
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
