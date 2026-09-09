import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('validates release version, package integrity, and presence of a full package before publication', () => {
  const directory = mkdtempSync(join(tmpdir(), 'max-feed-test-'));
  const script = resolve('scripts/publish-updates.cjs');
  const version = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }).version;
  const full = `Max-${version}-full.nupkg`;
  const delta = `Max-${version}-delta.nupkg`;
  const bytes = 'fixture-package';
  const hash = createHash('sha1').update(bytes).digest('hex');
  const run = (tag = `v${version}`) => spawnSync(process.execPath, [script, directory, '--dry-run'], { env: { ...process.env, RELEASE_TAG: tag }, encoding: 'utf8' });
  try {
    writeFileSync(join(directory, full), bytes);
    writeFileSync(join(directory, 'RELEASES'), `${hash} ${full} ${bytes.length}`);
    expect(run().status).toBe(0);
    expect(run('v9.0.0').status).toBe(1);
    writeFileSync(join(directory, full), 'damaged-package');
    expect(run().stderr).toContain('checksum/size mismatch');
    writeFileSync(join(directory, 'RELEASES'), `${hash} ${delta} ${bytes.length}`);
    writeFileSync(join(directory, delta), bytes);
    expect(run().stderr).toContain('full package is required');
  } finally {
    // mkdtemp generated this exact directory; never remove a caller-supplied path.
    if (resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/')) rmSync(directory, { recursive: true });
  }
});
