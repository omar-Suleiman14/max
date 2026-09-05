import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { isTrustedNavigationUrl } from '../security/trusted-sender';

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'assets', 'max.png'),
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

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
