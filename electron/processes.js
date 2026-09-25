'use strict';

/**
 * Supervises the two servers the board needs: the Python FastAPI engine and
 * the Next.js server.
 *
 * Run from a terminal these are two `./scripts/dev.sh` background jobs the user
 * babysits. In the desktop app they have to start in the right order, be waited
 * for rather than assumed ready, report progress while the model loads, and —
 * the part that actually bites — die when the app quits. Orphaned `next dev`
 * processes holding port 3000 have been a recurring nuisance in this project.
 *
 * Neither server claims a well-known port any more. The engine listens on a
 * Unix domain socket inside the data root, and the web server takes whatever
 * port the OS hands out, bound to loopback — only this app's own window ever
 * loads it, so nobody needs to know the number.
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

/**
 * sun_path is 104 bytes on macOS, including the terminator. A data root deep
 * enough to overflow it fails at bind() with a bare EINVAL, so check up front
 * and say what to do instead.
 */
const MAX_SOCKET_PATH_BYTES = 103;

/**
 * Where the engine listens. Same derivation as tts-engine/main.py,
 * scripts/dev.sh and src/lib/tts-client.ts; SAWTAK_ENGINE_SOCKET overrides all
 * four.
 */
function engineSocketPath(dataRoot) {
  const socketPath =
    process.env.SAWTAK_ENGINE_SOCKET || path.join(dataRoot, 'storage', 'run', 'engine.sock');
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH_BYTES) {
    throw new Error(
      `مسار الـ socket طويل زيادة عن اللزوم (${Buffer.byteLength(socketPath)} بايت، والحد ${MAX_SOCKET_PATH_BYTES}):\n${socketPath}\n\n` +
        'شغّل التطبيق و SAWTAK_ENGINE_SOCKET مظبوطة على مسار أقصر، زي /tmp/sawtak-engine.sock',
    );
  }
  return socketPath;
}

/**
 * uvicorn chmods the socket 0666, so the directory is what keeps other users
 * on the machine out. Created — and re-tightened if it already existed — 0700.
 *
 * Call only after isSocketLive() said no: any file left at the path is then a
 * stale socket from a run that died, and uvicorn in --reload mode fails with
 * EADDRINUSE instead of replacing it.
 */
function prepareSocketDir(socketPath) {
  const dir = path.dirname(socketPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch (error) {
    // An override into a shared directory (/tmp) is not ours to lock down;
    // whoever chose it chose its permissions too.
    log(`socket directory left as is (${error.code}): ${dir}`);
  }
  fs.rmSync(socketPath, { force: true });
}

/** The engine downloads weights on a cold machine, so this is generous. */
const ENGINE_READY_TIMEOUT_MS = 10 * 60 * 1000;
const WEB_READY_TIMEOUT_MS = 90 * 1000;

const children = new Set();

function log(...args) {
  console.log('[supervisor]', ...args);
}

/**
 * True when an engine is already answering on the socket — `./scripts/dev.sh`
 * running alongside, say. A stale socket *file* from a crash is not live
 * (connect fails with ECONNREFUSED); prepareSocketDir() clears it.
 */
function isSocketLive(socketPath) {
  return new Promise((resolve) => {
    const socket = net.connect({ path: socketPath });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(700, () => done(false));
  });
}

/** GET over the engine socket; resolves with the parsed JSON on a 200. */
function getOverSocket(socketPath, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ socketPath, path: pathname, timeout: 4000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

async function waitForEngine(socketPath, timeoutMs, onWait) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await getOverSocket(socketPath, '/api/health');
    } catch (error) {
      lastError = error;
    }
    if (onWait) onWait(Math.round((Date.now() - startedAt) / 1000));
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for the engine on ${socketPath}: ${lastError?.message ?? 'no response'}`);
}

function probePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address();
      server.close(() => resolve(bound));
    });
  });
}

/**
 * A loopback port that is free right now.
 *
 * `preferred` first, because the page's localStorage (remembered model, save
 * folder) is keyed by origin — a different port every launch would forget it
 * every launch. When something else holds that port, any free one: a
 * forgotten preference beats a collision. There is a window between closing
 * this probe and Next binding the port, but it is milliseconds.
 */
async function findFreePort(preferred) {
  if (preferred) {
    try {
      return await probePort(preferred);
    } catch {
      // taken — fall through to an OS-assigned port
    }
  }
  return probePort(0);
}

async function waitForHttp(url, timeoutMs, onWait) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) return await response.json().catch(() => ({}));
    } catch (error) {
      lastError = error;
    }
    if (onWait) onWait(Math.round((Date.now() - startedAt) / 1000));
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`);
}

/**
 * Spawn a child and keep a handle so `stopAll` can reach it.
 *
 * `detached: false` plus an explicit kill on quit is deliberate — on macOS the
 * renderer closing does not reap spawned servers, and a detached child would
 * outlive the app entirely.
 */
function start(name, command, args, options = {}) {
  log(`starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout.on('data', (b) => process.stdout.write(`[${name}] ${b}`));
  child.stderr.on('data', (b) => process.stderr.write(`[${name}] ${b}`));
  child.on('exit', (code, signal) => {
    children.delete(child);
    log(`${name} exited (code=${code} signal=${signal})`);
    if (options.onExit) options.onExit(code, signal);
  });
  children.add(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      log(`stopping pid ${child.pid}`);
      try {
        child.kill('SIGTERM');
      } catch {
        // already gone
      }
    }
  }
  // Anything still alive after the grace period is not going to exit politely.
  const stragglers = [...children];
  setTimeout(() => {
    for (const child of stragglers) {
      if (child.exitCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          // already gone
        }
      }
    }
  }, 4000);
}

/**
 * Where the compiled web app lives — the directory holding `.next`,
 * `node_modules` and `package.json`.
 *
 * Identical in both modes as it happens: in development this file is at
 * <repo>/electron/, and a packaged build (asar disabled, because `next start`
 * and Prisma's native engines cannot be executed from inside an archive) puts
 * the same tree at Contents/Resources/app/.
 */
function resolveRoot() {
  return path.resolve(__dirname, '..');
}

/**
 * Everything that differs between running from a checkout and running as an
 * installed app, decided in one place.
 *
 * Installed, the app is self-contained. Its Python runtime and engine code
 * ship inside the bundle (Contents/Resources/python, …/engine — built by
 * scripts/build-python-runtime.sh), and its data lives in the standard
 * per-user location, ~/Library/Application Support/Sawtak: the database,
 * storage/ with every clip and voice reference, and the engine socket. Nothing
 * refers back to the repository it was built from, and deleting or re-cloning
 * the repo cannot touch it.
 *
 * From a checkout (`npm run electron`), it is the developer's setup: the repo's
 * venv, the repo's tts-engine/, and the repo's own database and storage/ — the
 * same ones scripts/dev.sh uses. SAWTAK_DATA_ROOT overrides the data folder in
 * either mode.
 */
function resolveLayout(app) {
  const root = resolveRoot();

  if (app.isPackaged) {
    const resources = process.resourcesPath;
    const dataRoot = process.env.SAWTAK_DATA_ROOT || app.getPath('userData');
    return {
      packaged: true,
      root,
      dataRoot,
      dbPath: path.join(dataRoot, 'sawtak.db'),
      python: path.join(resources, 'python', 'bin', 'python3.11'),
      engineDir: path.join(resources, 'engine'),
    };
  }

  const dataRoot = process.env.SAWTAK_DATA_ROOT || root;
  return {
    packaged: false,
    root,
    dataRoot,
    dbPath: path.join(dataRoot, 'prisma', 'namaa.db'),
    python: path.join(root, 'tts-engine', 'venv', 'bin', 'python'),
    engineDir: path.join(root, 'tts-engine'),
  };
}

/**
 * Environment every Python process the app starts must carry.
 *
 * Python writes compiled bytecode (`__pycache__/`) next to the modules it
 * imports. Inside the .app that means writing into the signed bundle — 2,600+
 * files on the first run — which breaks its code signature: the next time
 * macOS verifies it, a downloaded copy reads as "Sawtak is damaged", and that
 * dialog, unlike the unsigned-developer one, has no "Open Anyway". The caches
 * go to the data folder instead, so the bundle stays byte-for-byte as signed.
 */
function pythonEnv(layout) {
  return layout.packaged
    ? { PYTHONPYCACHEPREFIX: path.join(layout.dataRoot, 'cache', 'pycache') }
    : {};
}

/**
 * Run a Node CLI with Electron's own binary as the runtime. A double-clicked
 * .app has no `node` on PATH — it does not inherit the user's shell at all.
 */
function runNodeScript(name, script, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = start(name, process.execPath, [script, ...args], {
      ...options,
      env: { ELECTRON_RUN_AS_NODE: '1', ...options.env },
      onExit: (code) => (code === 0 ? resolve() : reject(new Error(`${name} exited with code ${code}`))),
    });
    child.on('error', reject);
  });
}

/**
 * Create the data folder and bring the database up to the app's schema.
 *
 * `prisma migrate deploy` applies whatever migrations in prisma/migrations the
 * database has not seen — every one of them on first launch, only new ones
 * after an update, none otherwise — so an installed app upgrades its own
 * database instead of asking the user to run anything.
 *
 * Returns true when the database did not exist before, i.e. a first launch.
 */
async function prepareData(layout) {
  fs.mkdirSync(path.join(layout.dataRoot, 'storage', 'audio'), { recursive: true });
  fs.mkdirSync(path.join(layout.dataRoot, 'storage', 'voice-samples'), { recursive: true });
  const isNew = !fs.existsSync(layout.dbPath);

  await runNodeScript(
    'migrate',
    path.join(layout.root, 'node_modules', 'prisma', 'build', 'index.js'),
    ['migrate', 'deploy', '--schema', path.join(layout.root, 'prisma', 'schema.prisma')],
    {
      cwd: layout.root,
      env: {
        DATABASE_URL: `file:${layout.dbPath}`,
        // No update banner, no telemetry ping from inside an installed app.
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
        CHECKPOINT_DISABLE: '1',
      },
    },
  );
  return isNew;
}

/**
 * A new install starts with VoiceTut's shipped speakers as voice profiles,
 * rather than an empty voice list. Runs after the engine is up (the script
 * fetches the small reference-speakers folder from the model repo) and in the
 * background: the app is usable meanwhile, and a failure only means the list
 * starts empty.
 */
function importBuiltinVoices(layout) {
  start('voices', layout.python, [path.join(layout.engineDir, 'import_builtin_voices.py')], {
    cwd: layout.engineDir,
    env: {
      ...pythonEnv(layout),
      SAWTAK_ENGINE_DIR: layout.engineDir,
      SAWTAK_DATA_ROOT: layout.dataRoot,
      SAWTAK_DB_PATH: layout.dbPath,
      HF_HUB_DISABLE_XET: '1',
    },
  });
}

module.exports = {
  ENGINE_READY_TIMEOUT_MS,
  WEB_READY_TIMEOUT_MS,
  engineSocketPath,
  prepareSocketDir,
  isSocketLive,
  waitForEngine,
  findFreePort,
  waitForHttp,
  start,
  stopAll,
  resolveLayout,
  pythonEnv,
  prepareData,
  importBuiltinVoices,
  log,
};
