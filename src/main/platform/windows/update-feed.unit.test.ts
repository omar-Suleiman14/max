import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const { verifyUpdateFeed } = createRequire(import.meta.url)('../../../../scripts/verify-update-feed.cjs') as {
  verifyUpdateFeed: (directory: string, version: string) => number;
};
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function feed() {
  const directory = mkdtempSync(join(tmpdir(), 'max-feed-'));
  directories.push(directory);
  const data = Buffer.from('test update package');
  writeFileSync(join(directory, 'Max-0.4.5-full.nupkg'), data);
  writeFileSync(join(directory, 'RELEASES'), `${createHash('sha1').update(data).digest('hex')} Max-0.4.5-full.nupkg ${data.length}\n`);
  return directory;
}
it('accepts a complete Squirrel feed and rejects the wrong release version', () => {
  const directory = feed();
  expect(verifyUpdateFeed(directory, '0.4.5')).toBe(1);
  expect(() => verifyUpdateFeed(directory, '0.4.6')).toThrow('Missing full update package');
});
it('rejects missing and corrupt update packages', () => {
  const directory = feed();
  writeFileSync(join(directory, 'Max-0.4.5-full.nupkg'), 'bad');
  expect(() => verifyUpdateFeed(directory, '0.4.5')).toThrow('Incorrect size');
  writeFileSync(join(directory, 'Max-0.4.5-full.nupkg'), 'TEST update package');
  expect(() => verifyUpdateFeed(directory, '0.4.5')).toThrow('Incorrect checksum');
  rmSync(join(directory, 'Max-0.4.5-full.nupkg'));
  expect(() => verifyUpdateFeed(directory, '0.4.5')).toThrow();
});
