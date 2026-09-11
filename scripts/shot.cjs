// Capture a PNG of the browser preview (npm run dev:web) from Electron.
// Usage: electron scripts/shot.cjs <out.png> [setupScriptFile] [width] [height]
//
// Screenshots come from the DevTools protocol rather than capturePage(): the
// latter needs a composited, visible window and fails with UnknownVizError on a
// headless or software-rendered one.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');

const [out, setupFile, width = '1280', height = '860'] = process.argv.slice(2);

// A private profile per run: two capture processes sharing one cache directory
// fail to start with "Unable to move the cache".
app.setPath('userData', `${app.getPath('temp')}/max-shot-${process.pid}`);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ height: Number(height), show: false, width: Number(width) });
  await window.loadURL('http://127.0.0.1:5178/');
  await window.webContents.executeJavaScript(`new Promise((resolve) => {
    const deadline = Date.now() + 15000;
    const check = () => (document.querySelector('[data-app-ready="true"]') || Date.now() > deadline)
      ? resolve(true) : setTimeout(check, 80);
    check();
  })`);
  if (setupFile) {
    // A setup script that throws must not strand the process: capture anyway.
    await window.webContents.executeJavaScript(readFileSync(setupFile, 'utf8'))
      .then((value) => console.log('setup:', value), (error) => console.log('setup failed:', String(error)));
  }
  await new Promise((resolve) => setTimeout(resolve, 700));

  window.webContents.debugger.attach('1.3');
  const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  writeFileSync(out, Buffer.from(data, 'base64'));
  app.exit(0);
});
