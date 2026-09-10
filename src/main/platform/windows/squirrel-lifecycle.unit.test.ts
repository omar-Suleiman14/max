import { basename, dirname, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { handleSquirrelCommand } from './squirrel-lifecycle';

describe('Windows Squirrel lifecycle', () => {
  const executablePath = resolve('installed', 'app-0.1.0', 'max.exe');

  it.each(['--squirrel-install', '--squirrel-updated'])(
    'creates a shortcut for %s',
    (command) => {
      const quit = vi.fn();
      const runUpdate = vi.fn(
        (_executable: string, _args: readonly string[], done: () => void) => done(),
      );

      expect(handleSquirrelCommand({ command, executablePath, quit, runUpdate })).toBe(true);
      expect(runUpdate).toHaveBeenCalledWith(
        resolve(dirname(executablePath), '..', 'Update.exe'),
        ['--createShortcut', basename(executablePath), '--shortcut-locations', 'Desktop,StartMenu'],
        quit,
      );
      expect(quit).toHaveBeenCalledOnce();
    },
  );

  it('removes its shortcut during uninstall', () => {
    const quit = vi.fn();
    const runUpdate = vi.fn();

    expect(
      handleSquirrelCommand({
        command: '--squirrel-uninstall',
        executablePath,
        quit,
        runUpdate,
      }),
    ).toBe(true);
    expect(runUpdate).toHaveBeenCalledWith(
      resolve(dirname(executablePath), '..', 'Update.exe'),
      ['--removeShortcut', basename(executablePath), '--shortcut-locations', 'Desktop,StartMenu'],
      quit,
    );
  });

  it('quits obsolete builds without invoking Update.exe', () => {
    const quit = vi.fn();
    const runUpdate = vi.fn();

    expect(
      handleSquirrelCommand({
        command: '--squirrel-obsolete',
        executablePath,
        quit,
        runUpdate,
      }),
    ).toBe(true);
    expect(quit).toHaveBeenCalledOnce();
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it('leaves ordinary application starts untouched', () => {
    const quit = vi.fn();
    const runUpdate = vi.fn();

    expect(handleSquirrelCommand({ executablePath, quit, runUpdate })).toBe(false);
    expect(quit).not.toHaveBeenCalled();
    expect(runUpdate).not.toHaveBeenCalled();
  });
});
