/* global fetch, AbortSignal */
// Publish packages first and the Squirrel index last. No app data or backup access.
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, join, basename } = require('node:path');
const { spawnSync } = require('node:child_process');

// wrangler declares "exports", so its bin cannot be required by subpath. Resolve
// the CLI through the manifest, which the package does export.
function wranglerCli() {
  const manifestPath = require.resolve('wrangler/package.json');
  const { bin } = require(manifestPath);
  const entry = typeof bin === 'string' ? bin : bin && bin.wrangler;
  if (!entry) throw new Error('Could not locate the wrangler CLI.');
  return join(dirname(manifestPath), entry);
}

function collect(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name); return statSync(path).isDirectory() ? collect(path) : [path];
  });
}
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const root = process.argv[2];
  if (!root || root.startsWith('--')) throw new Error('Usage: node scripts/publish-updates.cjs <artifacts-directory> [--dry-run]');
  const version = require('../package.json').version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Only stable versions belong in the stable update feed.');
  if (process.env.RELEASE_TAG !== `v${version}`) throw new Error('Release tag must match package.json version.');
  const files = collect(root);
  const indexes = files.filter(p => basename(p) === 'RELEASES');
  if (indexes.length !== 1) throw new Error('Expected one Windows x64 RELEASES index.');
  const entries = readFileSync(indexes[0], 'utf8').trim().split(/\r?\n/).map(line => {
    const match = /^([a-f\d]{40}) (Max-(\d+\.\d+\.\d+)-(full|delta)\.nupkg) (\d+)$/i.exec(line);
    if (!match || match[3] !== version) throw new Error('Invalid release index or mismatched version.');
    const paths = files.filter(p => basename(p) === match[2]);
    if (paths.length !== 1) throw new Error('Missing or duplicate package.');
    const bytes = readFileSync(paths[0]);
    if (bytes.length !== Number(match[5]) || createHash('sha1').update(bytes).digest('hex') !== match[1].toLowerCase()) throw new Error('Package checksum/size mismatch.');
    return { path: paths[0], name: match[2], sha1: match[1].toLowerCase(), full: match[4] === 'full' };
  });
  if (!entries.some(e => e.full)) throw new Error('A full package is required.');
  const bucket = process.env.MAX_RELEASE_BUCKET || 'max-releases';
  const feed = (process.env.MAX_UPDATE_WORKER_URL || 'https://max-backup-worker.omaarsuliiman.workers.dev') + '/v1/releases/windows/x64/';
  if (!dryRun) {
    const current = await fetch(feed + 'RELEASES', { signal: AbortSignal.timeout(30000) });
    if (current.ok) {
      const text = await current.text();
      for (const match of text.matchAll(/Max-(\d+)\.(\d+)\.(\d+)-/g)) {
        const old = match.slice(1).map(Number); const next = version.split('.').map(Number);
        const first = old.findIndex((v, i) => v !== next[i]);
        if (first >= 0 && old[first] > next[first]) throw new Error('Refusing to downgrade the stable update feed.');
      }
    } else if (current.status !== 404) throw new Error(`Release feed unavailable: ${current.status}`);
    for (const entry of entries) {
      const previous = await fetch(feed + entry.name, { signal: AbortSignal.timeout(30000) });
      if (previous.ok) {
        const hash = createHash('sha1'); for await (const chunk of previous.body) hash.update(chunk);
        if (hash.digest('hex') !== entry.sha1) throw new Error('Refusing to replace an immutable release package.');
      } else if (previous.status !== 404) throw new Error('Could not verify immutable package.');
    }
  }
  for (const entry of [...entries, { path: indexes[0], name: 'RELEASES' }]) {
    const key = `${bucket}/windows/x64/${entry.name}`;
    console.log(`${dryRun ? 'Validated' : 'Publishing'} ${key}`);
    if (dryRun) continue;
    const result = spawnSync(process.execPath, [wranglerCli(), 'r2', 'object', 'put', key, '--file', entry.path, '--remote'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Release upload failed; feed was not advanced.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
