const { readdir, stat } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { gzipSync } = require('node:zlib');
const { extractFile } = require('@electron/asar');

const ROOT = resolve(__dirname, '..');
const OUT_ROOT = join(ROOT, 'out');

const BUDGETS = {
  appAsarBytes: 5 * 1024 * 1024,
  electronLocalesBytesPerPackage: 3 * 1024 * 1024,
  rendererEntryBytes: 450 * 1024,
  rendererEntryGzipBytes: 130 * 1024,
};

function isAllowedLocale(path) {
  const name = path.split(/[\\/]/u).at(-1) ?? '';
  return name === 'ar.pak'
    || name === 'en-US.pak'
    || name === 'ar.lproj'
    || name.startsWith('ar_')
    || name === 'en.lproj'
    || name.startsWith('en_');
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

async function findFiles(directory, fileName) {
  const matches = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(path, fileName)));
    } else if (entry.isFile() && entry.name === fileName) {
      matches.push(path);
    }
  }

  return matches;
}

async function findLocaleResources(directory) {
  const matches = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name === 'locales') {
      const localeEntries = await readdir(path, { withFileTypes: true });
      matches.push(...localeEntries
        .filter((localeEntry) => localeEntry.isFile() && localeEntry.name.endsWith('.pak'))
        .map((localeEntry) => join(path, localeEntry.name)));
    } else if (entry.isDirectory() && entry.name.endsWith('.lproj')) {
      matches.push(path);
    } else if (entry.isDirectory()) {
      matches.push(...(await findLocaleResources(path)));
    }
  }

  return matches;
}

async function pathSize(path) {
  const metadata = await stat(path);
  if (metadata.isFile()) return metadata.size;

  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => pathSize(join(path, entry.name))));
  return sizes.reduce((total, size) => total + size, 0);
}

async function main() {
  // Verify what users install; Forge can clean the intermediate Vite directory.
  const asarFiles = await findFiles(OUT_ROOT, 'app.asar');
  if (asarFiles.length === 0) throw new Error('Could not find a packaged app.asar under out/.');
  const rendererRoot = join('.vite', 'renderer', 'main_window');
  const indexHtml = extractFile(asarFiles[0], join(rendererRoot, 'index.html')).toString('utf8');
  const entryMatch = indexHtml.match(/<script[^>]+src="\.\/(assets\/index-[^"]+\.js)"/u);

  if (!entryMatch?.[1]) {
    throw new Error('Could not find the renderer entry script in the production index.html.');
  }

  const rendererContents = extractFile(asarFiles[0], join(rendererRoot, ...entryMatch[1].split('/')));
  const rendererGzipBytes = gzipSync(rendererContents).byteLength;
  const localeResources = await findLocaleResources(OUT_ROOT);

  if (asarFiles.length === 0) {
    throw new Error('Could not find a packaged app.asar under out/.');
  }
  if (localeResources.length === 0) {
    throw new Error('Could not find packaged Electron locale resources under out/.');
  }

  const failures = [];
  if (rendererContents.byteLength > BUDGETS.rendererEntryBytes) {
    failures.push(
      `Renderer entry ${formatBytes(rendererContents.byteLength)} exceeds ${formatBytes(BUDGETS.rendererEntryBytes)}.`,
    );
  }
  if (rendererGzipBytes > BUDGETS.rendererEntryGzipBytes) {
    failures.push(
      `Renderer entry gzip ${formatBytes(rendererGzipBytes)} exceeds ${formatBytes(BUDGETS.rendererEntryGzipBytes)}.`,
    );
  }

  const asarResults = [];
  for (const path of asarFiles) {
    const { size } = await stat(path);
    asarResults.push({ path, size });
    if (size > BUDGETS.appAsarBytes) {
      failures.push(`Packaged app.asar ${formatBytes(size)} exceeds ${formatBytes(BUDGETS.appAsarBytes)}.`);
    }
  }

  const unexpectedLocales = localeResources.filter((path) => !isAllowedLocale(path));
  if (unexpectedLocales.length > 0) {
    failures.push(`Unexpected packaged Electron locales: ${unexpectedLocales.join(', ')}`);
  }
  const localeSizes = await Promise.all(localeResources.map(pathSize));
  const localeBytes = localeSizes.reduce((total, size) => total + size, 0);
  if (localeBytes > BUDGETS.electronLocalesBytesPerPackage * asarFiles.length) {
    failures.push(
      `Electron locales ${formatBytes(localeBytes)} exceed ${formatBytes(BUDGETS.electronLocalesBytesPerPackage)} per package.`,
    );
  }

  process.stdout.write(`Renderer entry: ${formatBytes(rendererContents.byteLength)} (${formatBytes(rendererGzipBytes)} gzip)\n`);
  for (const result of asarResults) {
    process.stdout.write(`Packaged app.asar: ${formatBytes(result.size)} (${result.path})\n`);
  }
  process.stdout.write(`Electron locales: ${formatBytes(localeBytes)} (${localeResources.map((path) => path.split(/[\\/]/u).at(-1)).join(', ')})\n`);

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
