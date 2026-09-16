// Capture a PNG of the browser preview (npm run dev:web) from Electron.
// Usage: electron scripts/shot.cjs <out.png> [setupScriptFile] [width] [height] [settleMs]
//
// Screenshots come from the DevTools protocol rather than capturePage(): the
// latter needs a composited, visible window and fails with UnknownVizError on a
// headless or software-rendered one.
//
// Three things about the ordering below are load-bearing and were each found the
// hard way on Windows.
//
//   * The debugger is attached and Page enabled before anything is clicked. If
//     the setup script runs first, Page.captureScreenshot never returns.
//   * The window is shown. A hidden window stops producing frames once React
//     settles, and the capture then waits forever for one.
//   * Progress is written to <out>.log rather than stdout, because an Electron
//     GUI process on Windows does not reliably flush stdout back to the shell
//     that started it, which makes a stuck run look silent rather than stuck.
//
// A setup script must not evaluate to a promise: executeJavaScript never settles
// then. Start the work, return nothing, and report back by assigning a string to
// window.__capture, which is read into the log once the page has settled.
const { app, BrowserWindow } = require('electron');
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');

const [out, setupFile, width = '1280', height = '860', settle = '2500'] = process.argv.slice(2);

const logPath = `${out}.log`;
const log = (message) => appendFileSync(logPath, `${message}\n`);
writeFileSync(logPath, 'start\n');

// A private profile per run: two capture processes sharing one cache directory
// fail to start with "Unable to move the cache".
app.setPath('userData', `${app.getPath('temp')}/max-shot-${process.pid}`);

process.on('uncaughtException', (error) => {
  log(`failed: ${String(error)}`);
  app.exit(1);
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({ height: Number(height), show: true, width: Number(width) });
  await window.loadURL('http://127.0.0.1:5178/');
  log('loaded');

  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Page.enable');
  log('attached');

  await new Promise((resolve) => setTimeout(resolve, Number(settle)));

  if (setupFile) {
    // A setup script that throws must not strand the process: capture anyway.
    await window.webContents.executeJavaScript(readFileSync(setupFile, 'utf8'))
      .catch((error) => log(`setup failed: ${String(error)}`));
    await new Promise((resolve) => setTimeout(resolve, Number(settle)));
    log(`setup: ${await window.webContents.executeJavaScript('String(window.__capture)')}`);
  }

  const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(out, Buffer.from(data, 'base64'));
  log('done');
  app.exit(0);
});
