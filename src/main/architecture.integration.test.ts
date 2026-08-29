import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : ['.ts', '.tsx'].includes(extname(path)) ? [path] : [];
  });
}

describe('architecture boundaries', () => {
  const sourceRoot = resolve(import.meta.dirname, '..');

  it('keeps Electron, Node, and SQLite imports out of renderer code', () => {
    const rendererRoot = join(sourceRoot, 'renderer');
    const violations = sourceFiles(rendererRoot).flatMap((filename) => {
      const source = readFileSync(filename, 'utf8');
      return /from ['"](?:electron|node:)/.test(source)
        ? [relative(sourceRoot, filename)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('keeps SQLite imports inside the main-process database layer', () => {
    const databaseRoot = join(sourceRoot, 'main', 'database');
    const violations = sourceFiles(sourceRoot).flatMap((filename) => {
      if (filename.startsWith(databaseRoot) || filename.endsWith('.test.ts')) {
        return [];
      }
      return readFileSync(filename, 'utf8').includes("from 'node:sqlite'")
        ? [relative(sourceRoot, filename)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('isolates process.platform checks in the platform adapter', () => {
    const mainRoot = join(sourceRoot, 'main');
    const adapter = join(mainRoot, 'platform', 'platform-adapter.ts');
    const violations = sourceFiles(mainRoot).flatMap((filename) => {
      if (filename === adapter || filename.endsWith('.test.ts')) {
        return [];
      }
      return readFileSync(filename, 'utf8').includes('process.platform')
        ? [relative(sourceRoot, filename)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
