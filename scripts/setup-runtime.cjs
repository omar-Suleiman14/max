const { copyFileSync, existsSync, mkdirSync, readdirSync } = require('node:fs');
const { homedir } = require('node:os');
const { dirname, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = join(__dirname, '..');
const electronCacheRoot = join(projectRoot, '.cache', 'electron');
const electronZipRoot = join(projectRoot, '.cache', 'electron-zips');
const electronExecutableByPlatform = {
  darwin: 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
  linux: 'node_modules/electron/dist/electron',
  win32: 'node_modules/electron/dist/electron.exe',
};

function runPackageSetup(label, relativeScript, marker, always = false, relativeWorkingDirectory) {
  const markerPath = join(projectRoot, marker);
  if (!always && existsSync(markerPath)) {
    return;
  }

  const scriptPath = join(projectRoot, relativeScript);
  if (!existsSync(scriptPath)) {
    throw new Error(`${label} setup script is missing. Run npm install first.`);
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: relativeWorkingDirectory
      ? join(projectRoot, relativeWorkingDirectory)
      : dirname(scriptPath),
    env: {
      ...process.env,
      electron_config_cache:
        process.env.electron_config_cache ?? electronCacheRoot,
      ELECTRON_CACHE:
        process.env.ELECTRON_CACHE ?? electronCacheRoot,
    },
    stdio: 'inherit',
  });

  if (result.status !== 0 || !existsSync(markerPath)) {
    throw new Error(`${label} runtime setup failed.`);
  }
}

function findFile(directory, filename) {
  if (!existsSync(directory)) return undefined;

  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name === filename) {
        return entryPath;
      }
    }
  }

  return undefined;
}

function prepareElectronArchive() {
  const electronVersion = require(join(projectRoot, 'node_modules', 'electron', 'package.json')).version;
  const archiveName = `electron-v${electronVersion}-${process.platform}-${process.arch}.zip`;
  const stableArchive = join(electronZipRoot, archiveName);
  if (existsSync(stableArchive)) return;

  const platformCacheRoot = process.platform === 'win32'
    ? process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'electron', 'Cache')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Caches', 'electron')
      : join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'electron');
  const cacheRoots = [electronCacheRoot, process.env.ELECTRON_CACHE, platformCacheRoot]
    .filter((value, index, values) => typeof value === 'string' && values.indexOf(value) === index);
  const cachedArchive = cacheRoots.map((root) => findFile(root, archiveName)).find(Boolean);
  if (!cachedArchive) {
    throw new Error(`Electron archive ${archiveName} is missing after runtime setup.`);
  }

  mkdirSync(electronZipRoot, { recursive: true });
  copyFileSync(cachedArchive, stableArchive);
}

runPackageSetup(
  'Electron',
  'node_modules/electron/install.js',
  electronExecutableByPlatform[process.platform] ?? 'node_modules/electron/path.txt',
);
prepareElectronArchive();

runPackageSetup(
  'esbuild',
  'node_modules/esbuild/install.js',
  'node_modules/esbuild/bin/esbuild',
  true,
);

if (process.platform === 'win32') {
  runPackageSetup(
    'electron-winstaller',
    'node_modules/electron-winstaller/script/select-7z-arch.js',
    'node_modules/electron-winstaller/vendor/7z.exe',
    false,
    'node_modules/electron-winstaller',
  );
}

/**
 * Compile one native addon that `npm ci --ignore-scripts` left unbuilt.
 *
 * Lifecycle scripts stay off, so anything with a binding.gyp arrives as source.
 * These two are named explicitly, the same way the Electron and esbuild
 * runtimes are, rather than turning build scripts back on for every dependency.
 */
function buildNativeAddon(label, relativePackage, marker) {
  if (existsSync(join(projectRoot, marker))) return;

  const nodeGyp = join(projectRoot, 'node_modules', '@electron', 'node-gyp', 'bin', 'node-gyp.js');
  if (!existsSync(nodeGyp)) {
    throw new Error(`${label} cannot be built: node-gyp is missing. Run npm install first.`);
  }

  const result = spawnSync(process.execPath, [nodeGyp, 'rebuild'], {
    cwd: join(projectRoot, relativePackage),
    env: { ...process.env, npm_config_build_from_source: 'true' },
    stdio: 'inherit',
  });

  if (result.status !== 0 || !existsSync(join(projectRoot, marker))) {
    throw new Error(`${label} native build failed.`);
  }
}

if (process.platform === 'darwin') {
  // appdmg reaches for both of these while it lays out the disk image window.
  // Without them `electron-forge make` cannot produce a .dmg at all, which is
  // why macOS releases only ever carried a loose zipped app.
  buildNativeAddon('macos-alias', 'node_modules/macos-alias', 'node_modules/macos-alias/build/Release/volume.node');
  buildNativeAddon('fs-xattr', 'node_modules/fs-xattr', 'node_modules/fs-xattr/build/Release/xattr.node');
}
