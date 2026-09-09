import { existsSync } from 'node:fs';
import { UpdateService } from './platform/windows/update-service';
import { app, autoUpdater, BrowserWindow, dialog, session } from 'electron';
import { dirname, join } from 'node:path';

import { CloudBackupService } from './cloud/cloud-backup-service';
import { DatabaseService } from './database/database-service';
import { registerIpcHandlers, removeIpcHandlers } from './ipc/register-ipc-handlers';
import { getPlatformAdapter } from './platform/platform-adapter';
import { handleWindowsSquirrelLifecycle } from './platform/windows/squirrel-lifecycle';
import { registerAppProtocol, registerAppScheme } from './protocol/register-app-protocol';
import { runSmokeTest } from './smoke/run-smoke-test';
import { createMainWindow } from './window/create-main-window';

// Separate disposable UI-test workspaces from the owner's real shop.
if (!app.isPackaged && process.env.MAX_DEV_USER_DATA_DIR) app.setPath('userData', process.env.MAX_DEV_USER_DATA_DIR);

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
  let updates: UpdateService | undefined;
  let backupTimer: ReturnType<typeof setInterval> | undefined;

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

      const installedWindows = platform.platform === 'windows' && app.isPackaged && existsSync(join(dirname(process.execPath), '..', 'Update.exe'));
      updates = new UpdateService(installedWindows ? autoUpdater : undefined, app.getVersion(), MAX_UPDATE_WORKER_URL + '/v1/releases/windows/' + process.arch);
      if (process.env.MAX_SMOKE_TEST !== '1') updates.start();
      registerIpcHandlers({
        updates,
        cloudBackups,
        database,
        developmentServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
        platform,
      });

      const checkBackup = () => {
        if (!database) return;
        try {
          const metadata = database.shopMetadata.getMetadata();
          if (!metadata.onboardingCompleted || metadata.backupSchedule === 'manual') return;
          const interval = (metadata.backupSchedule === 'weekly' ? 7 : 1) * 86400000;
          const latest = database.backups.listBackups().filter(b => b.trigger === 'daily' || b.trigger === 'weekly').reduce((last, b) => Math.max(last, Date.parse(b.createdAt) || 0), 0);
          if (Date.now() - latest >= interval) database.backups.createBackup(metadata.backupSchedule);
        } catch (error) { console.error('Scheduled local backup failed:', error); }
      };
      if (process.env.MAX_SMOKE_TEST !== '1') { checkBackup(); backupTimer = setInterval(checkBackup, 60000); }
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
    if (backupTimer) clearInterval(backupTimer);
    updates?.dispose();
    removeIpcHandlers();
    database?.close();
  });
}
