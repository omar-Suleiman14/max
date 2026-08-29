import { app, ipcMain } from 'electron';

import { IPC_CHANNELS, type SystemHealth } from '../../shared/ipc-contract';
import type { DatabaseService } from '../database/database-service';
import type { PlatformAdapter } from '../platform/platform-adapter';
import { assertTrustedSender } from '../security/trusted-sender';

type RegisterIpcHandlersOptions = Readonly<{
  database: DatabaseService;
  developmentServerUrl?: string;
  platform: PlatformAdapter;
}>;

export function registerIpcHandlers({
  database,
  developmentServerUrl,
  platform,
}: RegisterIpcHandlersOptions): void {
  ipcMain.handle(IPC_CHANNELS.systemHealth, (event): SystemHealth => {
    const senderUrl = event.senderFrame?.url;
    if (!senderUrl) {
      throw new Error('Rejected IPC request without a sender frame.');
    }
    assertTrustedSender(senderUrl, developmentServerUrl);

    return {
      appVersion: app.getVersion(),
      database: database.getHealth(),
      runtime: platform,
    };
  });
}

export function removeIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.systemHealth);
}
