import { app, BrowserWindow, dialog, session } from 'electron';
import { join } from 'node:path';

import { CloudBackupService } from './cloud/cloud-backup-service';
import { DatabaseService } from './database/database-service';
import { registerIpcHandlers, removeIpcHandlers } from './ipc/register-ipc-handlers';
import { getPlatformAdapter } from './platform/platform-adapter';
import { handleWindowsSquirrelLifecycle } from './platform/windows/squirrel-lifecycle';
import { registerAppProtocol, registerAppScheme } from './protocol/register-app-protocol';
import { runSmokeTest } from './smoke/run-smoke-test';
import { createMainWindow } from './window/create-main-window';

const platform = getPlatformAdapter();
if (process.env.MAX_SMOKE_TEST === '1') {
  // Deterministic screenshots on CI/virtualized GPUs.
  app.disableHardwareAcceleration();
}
const handledInstallerLifecycle =
  platform.platform === 'windows' && handleWindowsSquirrelLifecycle();

if (!handledInstallerLifecycle) {
  registerAppScheme();
}

const hasSingleInstanceLock = handledInstallerLifecycle ? false : app.requestSingleInstanceLock();

if (handledInstallerLifecycle) {
  // Squirrel owns this short-lived process and exits it after lifecycle work.
} else if (!hasSingleInstanceLock) {
  app.quit();
} else {
  let database: DatabaseService | undefined;

  app.on('second-instance', () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (existingWindow) {
      if (existingWindow.isMinimized()) existingWindow.restore();
      existingWindow.focus();
    }
  });

  void app
    .whenReady()
    .then(async () => {
      if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        registerAppProtocol(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`));
      }

      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });

      database = new DatabaseService(join(app.getPath('userData'), 'max.sqlite'));
      database.initialize();
      const cloudBackups = new CloudBackupService(
        database.backups,
        MAX_BACKUP_WORKER_URL,
        join(app.getPath('userData'), 'cloud-backup-state.json'),
      );

      registerIpcHandlers({
        cloudBackups,
        database,
        developmentServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
        platform,
      });

      const mainWindow = await createMainWindow();

      if (process.env.MAX_SMOKE_TEST === '1') {
        await runSmokeTest(mainWindow);
        app.quit();
        return;
      }

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createMainWindow();
        }
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown startup failure.';
      console.error('Max failed to start:', error);
      process.exitCode = 1;

      if (process.env.MAX_SMOKE_TEST !== '1') {
        dialog.showErrorBox(
          'Max could not start',
          `Max stopped before opening the workspace. Restart Max and try again.\n\nDetails: ${message}`,
        );
      }
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (platform.platform !== 'macos') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    removeIpcHandlers();
    database?.close();
  });
}
