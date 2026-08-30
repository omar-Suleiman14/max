import type { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';

async function waitForShellReady(window: BrowserWindow): Promise<boolean> {
  return (await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const check = () => {
        if (document.querySelector('[data-app-ready="true"]') || document.querySelector('.onboarding-container')) {
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  `)) as boolean;
}

async function applySmokePreferences(window: BrowserWindow): Promise<void> {
  const requestedLocale = process.env.MAX_SMOKE_LOCALE;
  const requestedTheme = process.env.MAX_SMOKE_THEME;
  const locale = ['ar', 'en'].includes(requestedLocale ?? '') ? requestedLocale : undefined;
  const theme = ['dark', 'light', 'system'].includes(requestedTheme ?? '') ? requestedTheme : undefined;
  if (!locale && !theme) return;

  const reloadCompleted = new Promise<void>((resolveReload) => {
    window.webContents.once('did-finish-load', () => resolveReload());
  });
  const preferences = JSON.stringify({ locale, theme });
  await window.webContents.executeJavaScript(`
    const preferences = ${preferences};
    if (preferences.locale) localStorage.setItem('max.ui.locale', preferences.locale);
    if (preferences.theme) localStorage.setItem('max.ui.theme', preferences.theme);
    setTimeout(() => location.reload(), 0);
    true;
  `);
  await reloadCompleted;
}

async function openSmokeSurface(window: BrowserWindow): Promise<void> {
  const surface = process.env.MAX_SMOKE_SURFACE;
  if (!surface) return;

  if (surface === 'onboarding') {
    return;
  }

  // If we are on the onboarding screen and a workspace surface was requested, auto-complete onboarding for smoke test
  await window.webContents.executeJavaScript(`
    (async () => {
      if (document.querySelector('.onboarding-container') && window.maxApi?.shop) {
        await window.maxApi.shop.completeOnboarding({
          shopName: 'Smoke Test Shop',
          locale: (localStorage.getItem('max.ui.locale') === 'ar' ? 'ar' : 'en'),
          backupSchedule: 'daily'
        });
        location.reload();
      }
    })();
  `);

  if (['items', 'property', 'record', 'template'].includes(surface)) {
    const opened = (await window.webContents.executeJavaScript(`
      (async () => {
        const waitFor = async (selector) => {
          const deadline = Date.now() + 3000;
          while (Date.now() < deadline) {
            const element = document.querySelector(selector);
            if (element) return element;
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          return null;
        };
        document.querySelector('.sidebar__nav .nav-item:nth-child(2)')?.click();
        const workspace = await waitFor('.object-workspace');
        if (!workspace) return false;
        const surface = ${JSON.stringify(surface)};
        if (surface === 'property') {
          if (!document.querySelector('.schema-panel')) {
            const propBtn = Array.from(document.querySelectorAll('.object-toolbar__actions button')).find((b) =>
              b.textContent?.toLowerCase().includes('properties') || b.textContent?.includes('الخصائص'),
            ) as HTMLButtonElement | undefined;
            propBtn?.click();
          }
          const trigger = await waitFor('.schema-panel__head button');
          trigger?.click();
          return Boolean(trigger);
        }
        if (surface === 'template') {
          if (!document.querySelector('.schema-panel')) {
            const templateBtn = Array.from(document.querySelectorAll('.object-toolbar__actions button')).find((b) =>
              b.textContent?.toLowerCase().includes('templates') || b.textContent?.includes('القوالب'),
            ) as HTMLButtonElement | undefined;
            templateBtn?.click();
          }
          const tab = await waitFor('.schema-tab-button:nth-child(2)');
          tab?.click();
          return Boolean(tab);
        }
        if (surface === 'record') {
          const trigger = await waitFor('.object-toolbar .button');
          trigger?.click();
          return Boolean(trigger);
        }
        return true;
      })();
    `)) as boolean;
    if (!opened) throw new Error(`Smoke surface ${surface} could not be opened.`);
    return;
  }

  const selectorBySurface: Readonly<Record<string, string>> = {
    create: '.topbar [aria-haspopup="menu"]',
    settings: '.sidebar__footer button:last-child',
  };
  const selector = selectorBySurface[surface];
  if (surface !== 'command' && !selector) {
    throw new Error(`Unknown smoke surface: ${surface}.`);
  }
  const opened = (await window.webContents.executeJavaScript(
    surface === 'command'
      ? `document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'k' })); true;`
      : `(() => { const target = document.querySelector(${JSON.stringify(selector)}); target?.click(); return Boolean(target); })();`,
  )) as boolean;
  if (!opened) throw new Error(`Smoke surface ${surface} could not be opened.`);
}

export async function runSmokeTest(window: BrowserWindow): Promise<void> {
  let shellBecameReady = await waitForShellReady(window);
  await applySmokePreferences(window);
  if (process.env.MAX_SMOKE_LOCALE || process.env.MAX_SMOKE_THEME) {
    shellBecameReady = await waitForShellReady(window);
  }
  if (!shellBecameReady) {
    throw new Error('The renderer did not reach its database-backed ready state.');
  }

  const screenshotPath = process.env.MAX_SMOKE_SCREENSHOT_PATH;
  if (!screenshotPath) return;
  await openSmokeSurface(window);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  const screenshot = await window.capturePage();
  await writeFile(screenshotPath, screenshot.toPNG());
}
