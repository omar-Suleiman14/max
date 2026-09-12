const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

function verifyUpdateFeed(directory, version) {
  const indexes = [];
  function find(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = join(current, entry.name);
      if (entry.isDirectory()) find(filename);
      else if (entry.name === 'RELEASES') indexes.push(filename);
    }
  }
  find(directory);
  if (indexes.length !== 1) throw new Error('Expected exactly one RELEASES index.');
  const index = indexes[0];
  const lines = readFileSync(index, 'utf8').trim().split(/\r?\n/);
  let current = false;
  for (const line of lines) {
    const match = /^([a-f\d]{40}) ([\w.-]+\.nupkg) (\d+)$/i.exec(line.trim());
    if (!match) throw new Error('Invalid RELEASES entry.');
    const [, hash, filename, size] = match;
    const contents = readFileSync(join(dirname(index), filename));
    if (contents.length !== Number(size)) throw new Error(`Incorrect size: ${filename}`);
    if (createHash('sha1').update(contents).digest('hex') !== hash.toLowerCase()) throw new Error(`Incorrect checksum: ${filename}`);
    if (filename === `Max-${version}-full.nupkg`) current = true;
  }
  if (!current) throw new Error(`Missing full update package for ${version}.`);
  return lines.length;
}

module.exports = { verifyUpdateFeed };
if (require.main === module) {
  const [, , directory, version] = process.argv;
  if (!directory || !version) throw new Error('Usage: node scripts/verify-update-feed.cjs <directory> <version>');
  console.log(`Verified ${verifyUpdateFeed(directory, version)} update package(s) for ${version}.`);
}
