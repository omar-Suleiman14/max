import { app } from 'electron';
import { spawn } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';

type SquirrelCommand =
  | '--squirrel-install'
  | '--squirrel-obsolete'
  | '--squirrel-uninstall'
  | '--squirrel-updated';

type HandleSquirrelCommandOptions = Readonly<{
  command?: string;
  executablePath: string;
  quit: () => void;
  runUpdate: (updateExecutable: string, args: readonly string[], done: () => void) => void;
}>;

const commands = new Set<SquirrelCommand>([
  '--squirrel-install',
  '--squirrel-obsolete',
  '--squirrel-uninstall',
  '--squirrel-updated',
]);

function isSquirrelCommand(value: string | undefined): value is SquirrelCommand {
  return value !== undefined && commands.has(value as SquirrelCommand);
}

export function handleSquirrelCommand({
  command,
  executablePath,
  quit,
  runUpdate,
}: HandleSquirrelCommandOptions): boolean {
  if (!isSquirrelCommand(command)) {
    return false;
  }

  if (command === '--squirrel-obsolete') {
    quit();
    return true;
  }

  const updateExecutable = resolve(dirname(executablePath), '..', 'Update.exe');
  const shortcutAction =
    command === '--squirrel-uninstall' ? '--removeShortcut' : '--createShortcut';
  runUpdate(
    updateExecutable,
    [shortcutAction, basename(executablePath), '--shortcut-locations', 'Desktop,StartMenu'],
    quit,
  );
  return true;
}

export function handleWindowsSquirrelLifecycle(): boolean {
  return handleSquirrelCommand({
    command: process.argv[1],
    executablePath: process.execPath,
    quit: () => app.exit(0),
    runUpdate(updateExecutable, args, done) {
      const child = spawn(updateExecutable, args, {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        child.unref();
        done();
      };
      // Squirrel holds its progress window open until this hook exits, and an
      // installer that looks stuck invites a second double-click, which makes
      // two Setup.exe processes fight over the same files and fail outright.
      // The shortcut work is detached, so hand off as soon as it is running
      // rather than waiting for it to finish.
      const watchdog = setTimeout(finish, 4_000);
      child.once('spawn', finish);
      child.once('error', finish);
      child.once('close', finish);
    },
  });
}
