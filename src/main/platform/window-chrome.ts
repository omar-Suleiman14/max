import type { BrowserWindowConstructorOptions } from 'electron';
import type { SupportedPlatform } from './platform-adapter';

export function windowChromeOptions(platform: SupportedPlatform): BrowserWindowConstructorOptions {
  return platform === 'windows' ? {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1b212c', symbolColor: '#e3e6ec', height: 35 },
  } : { autoHideMenuBar: true };
}
