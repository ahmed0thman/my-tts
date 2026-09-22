'use strict';

/**
 * Electron entry point.
 *
 * The board is a Next.js app with Server Actions and Prisma, so it needs a real
 * Node server — it cannot collapse into a renderer. Electron's job here is
 * therefore lifecycle, not rendering: start the FastAPI engine and the Next
 * server, wait until each is genuinely answering, show the user what is
 * happening meanwhile, then point a window at it and tear everything down on
 * quit.
 *
 * The splash matters more than it looks. A cold start downloads 2.3 GB of
 * weights and a warm one still spends several seconds loading the model; a
 * blank window for that long reads as a hang.
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const {
  ENGINE_PORT,
  WEB_PORT,
  ENGINE_READY_TIMEOUT_MS,
  WEB_READY_TIMEOUT_MS,
  isPortOpen,
  waitForHttp,
  start,
  stopAll,
  resolveRoot,
  log,
} = require('./processes');

const ROOT = resolveRoot();
// Packaged builds always serve the compiled app. TTS_FORCE_PROD lets the
// production path be exercised from a checkout, which is otherwise only
// reachable by building a full .app.
const isDev = !app.isPackaged && process.env.TTS_FORCE_PROD !== '1';

/**
 * Everything interactive inside the header has to opt back out, or the buttons
 * become dead zones that drag the window instead of clicking. The left padding
 * clears the traffic lights, which sit at the physical top-left in both LTR and
 * RTL.
 */
const DRAG_REGION_CSS = `
  header.sticky.top-0 { -webkit-app-region: drag; }
  header.sticky.top-0 button,
  header.sticky.top-0 a,
  header.sticky.top-0 input,
  header.sticky.top-0 select,
  header.sticky.top-0 [role="button"],
  header.sticky.top-0 [role="combobox"] { -webkit-app-region: no-drag; }
  header.sticky.top-0 > div { padding-left: 84px; }
`;

const ICON_PNG = path.join(ROOT, 'build', 'icon.png');

/**
 * Only a packaged .app carries its icon in the bundle's Info.plist. Run from a
 * checkout, macOS shows the Electron binary's own icon in the dock and the
 * app switcher — there is nothing else to show. Setting it at runtime is the
 * only fix, and it is a no-op once packaged, where the bundle already wins.
 */
function applyDevIcon() {
  if (process.platform !== 'darwin' || app.isPackaged) return;
  // PNG, not the .icns: iconutil's output here is a valid icon file (sips and
  // Finder read it, and electron-builder ships it in the bundle) but Electron's
  // nativeImage refuses it — "Failed to load image from path". The PNG loads,
  // and at 512px it is larger than any dock slot needs.
  const source = ICON_PNG;
  if (!fs.existsSync(source)) {
    log('no icon in build/ — run `npm run icons`');
    return;
  }
  try {
    app.dock.setIcon(source);
  } catch (error) {
    // Cosmetic; never let it stop the launch.
    log('could not set dock icon:', error.message);
  }
}

/** Windows and Linux take the icon per-window; macOS ignores this and uses the dock/bundle. */
function windowIcon() {
  return fs.existsSync(ICON_PNG) ? ICON_PNG : undefined;
}

let splash = null;
let mainWindow = null;
/** Set once we decide to exit, so a supervised child dying does not also raise an error dialog. */
let quitting = false;

function say(message) {
  log(message);
  if (splash && !splash.isDestroyed()) {
    splash.webContents.send('status', message);
  }
}

function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 300,
    resizable: false,
    frame: false,
    show: true,
    backgroundColor: '#0c0b0a',
    icon: windowIcon(),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0c0b0a',
    icon: windowIcon(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // Nothing in the page needs Node; it is the same origin the browser loads.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${WEB_PORT}`);

  // `hiddenInset` removes the native title bar, and macOS then has nothing to
  // drag the window by — Electron does not make that strip draggable on its
  // own, the page has to declare the region. The app's sticky header is the
  // natural handle, so the rule is injected here rather than written into the
  // Next app: `-webkit-app-region` is meaningless in a normal browser and does
  // not belong in shared styles.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(DRAG_REGION_CSS).catch(() => {
      // A failed cosmetic injection must never take the window down.
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splash && !splash.isDestroyed()) splash.destroy();
    splash = null;
  });

  // Anything that is not the local app opens in the real browser — model cards
  // on HuggingFace, documentation links.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${WEB_PORT}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function pythonBinary() {
  const venv = path.join(ROOT, 'tts-engine', 'venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return null;
}

async function startEngine() {
  if (await isPortOpen(ENGINE_PORT)) {
    say('لقينا المحرك شغّال بالفعل');
    return;
  }

  const python = pythonBinary();
  if (!python) {
    throw new Error(
      `Python environment not found at tts-engine/venv.\n\nRun ./scripts/setup.sh once to create it.`
    );
  }

  say('بنشغّل محرك الصوت...');
  start('engine', python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(ENGINE_PORT)], {
    cwd: path.join(ROOT, 'tts-engine'),
    onExit: (code) => {
      if (!quitting && code !== 0) fail(`The speech engine stopped unexpectedly (exit ${code}).`);
    },
  });

  await waitForHttp(`http://127.0.0.1:${ENGINE_PORT}/api/health`, ENGINE_READY_TIMEOUT_MS, (seconds) => {
    if (seconds && seconds % 5 === 0) {
      say(`بنحمّل النموذج... (${seconds} ثانية)`);
    }
  });
  say('المحرك جاهز');
}

async function startWeb() {
  if (await isPortOpen(WEB_PORT)) {
    say('لقينا الواجهة شغّالة بالفعل');
    return;
  }

  say('بنشغّل الواجهة...');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // `next start` needs a production build; in development `next dev` is both
  // faster to boot and what the repo is set up for.
  const args = isDev ? ['next', 'dev', '--port', String(WEB_PORT)] : ['next', 'start', '--port', String(WEB_PORT)];
  start('web', npx, args, {
    cwd: ROOT,
    env: { NODE_ENV: isDev ? 'development' : 'production' },
    onExit: (code) => {
      if (!quitting && code !== 0) fail(`The app server stopped unexpectedly (exit ${code}).`);
    },
  });

  await waitForHttp(`http://localhost:${WEB_PORT}`, WEB_READY_TIMEOUT_MS).catch(async () => {
    // The root route renders; a non-JSON body is fine, we only need a 200.
    await waitForHttp(`http://localhost:${WEB_PORT}`, 10_000);
  });
  say('الواجهة جاهزة');
}

function fail(message) {
  log('FATAL', message);
  if (splash && !splash.isDestroyed()) splash.destroy();
  dialog.showErrorBox('صوتك · Sawtak', message);
  quitting = true;
  stopAll();
  app.quit();
}

app.whenReady().then(async () => {
  applyDevIcon();
  createSplash();
  try {
    await startEngine();
    await startWeb();
    createMainWindow();
  } catch (error) {
    fail(error.message ?? String(error));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Quitting must stop the servers, or the ports stay held and the next launch
// silently attaches to a stale engine.
app.on('before-quit', () => {
  quitting = true;
  stopAll();
});

app.on('window-all-closed', () => {
  quitting = true;
  stopAll();
  app.quit();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    quitting = true;
    stopAll();
    app.quit();
  });
}
