import { getPlatformAdapter } from '../platform/platform-adapter';
import { windowChromeOptions } from '../platform/window-chrome';
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { isTrustedNavigationUrl } from '../security/trusted-sender';

export async function createMainWindow(): Promise<BrowserWindow> {
  const platform = getPlatformAdapter();
  const window = new BrowserWindow({
    ...windowChromeOptions(platform.platform),
    icon: join(app.getAppPath(), 'assets', 'max.png'),
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  if (platform.platform !== 'macos') window.setMenu(null);
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedNavigationUrl(url, MAIN_WINDOW_VITE_DEV_SERVER_URL)) {
      event.preventDefault();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadURL('max://app/index.html');
  }

  return window;
}
