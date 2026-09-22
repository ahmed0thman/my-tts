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
 */

const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

// Overridable so the supervisor can be exercised without disturbing servers
// already running on the standard ports.
const ENGINE_PORT = Number(process.env.TTS_ENGINE_PORT || 8000);
const WEB_PORT = Number(process.env.TTS_WEB_PORT || 3000);

/** The engine downloads weights on a cold machine, so this is generous. */
const ENGINE_READY_TIMEOUT_MS = 10 * 60 * 1000;
const WEB_READY_TIMEOUT_MS = 90 * 1000;

/**
 * Where a user who followed the published install instructions put the project.
 * Keep this in sync with the `git clone` line on the landing page — they are
 * two halves of the same contract.
 */
const DEFAULT_DATA_ROOT = path.join(require('node:os').homedir(), 'sawtak');

const children = new Set();

function log(...args) {
  console.log('[supervisor]', ...args);
}

/** True when something is already listening — a leftover server, or another copy of the app. */
function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(700, () => done(false));
  });
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
 * Where the *data* lives: the Python virtualenv, the SQLite database, and
 * `storage/` with every generated clip and voice reference.
 *
 * This is deliberately NOT inside the .app. The virtualenv cannot go in one —
 * `venv/bin/python` is a symlink to a uv-managed interpreter outside the repo,
 * and a venv records absolute paths, so copying it into the bundle produces a
 * build that only works on the machine that made it. The database and
 * `storage/` stay out for a better reason: `VoiceProfile.referenceAudioPath`
 * holds absolute paths, so moving them would orphan every voice the user has
 * already recorded.
 *
 * Candidates are tried in order and **each one is checked on disk**, because
 * the most specific of them is also the least portable: the build machine's
 * own path, written into `electron/data-root.json` by
 * scripts/prepare-desktop-build.mjs. Returning that unvalidated is what made
 * an installed .app look for the venv inside the *packager's* home directory
 * on someone else's Mac, and fail with their username in the error. So the
 * baked path now has to exist to win, and DEFAULT_DATA_ROOT — the location the
 * published install instructions tell people to clone into — catches everyone
 * else. SAWTAK_DATA_ROOT overrides the lot.
 */
function dataRootCandidates() {
  return [
    process.env.SAWTAK_DATA_ROOT,
    // In development this file sits at <repo>/electron/, so the repo is right here.
    path.resolve(__dirname, '..'),
    readBakedDataRoot(),
    DEFAULT_DATA_ROOT,
  ].filter(Boolean);
}

function readBakedDataRoot() {
  try {
    const baked = JSON.parse(fs.readFileSync(path.join(__dirname, 'data-root.json'), 'utf8'));
    return baked.dataRoot || null;
  } catch {
    return null;
  }
}

/** A data root is only real if the engine's interpreter is actually in it. */
function hasEngineVenv(root) {
  return fs.existsSync(path.join(root, 'tts-engine', 'venv', 'bin', 'python'));
}

function resolveDataRoot() {
  // An explicit override is obeyed even when it is wrong, so the failure names
  // the path the user chose rather than silently using a different one.
  if (process.env.SAWTAK_DATA_ROOT) return process.env.SAWTAK_DATA_ROOT;

  const candidates = dataRootCandidates();
  const found = candidates.find(hasEngineVenv);
  if (found) return found;

  // Nothing is set up yet. Report the documented location, since that is the
  // one the setup instructions the user was given will create.
  return DEFAULT_DATA_ROOT;
}

module.exports = {
  ENGINE_PORT,
  WEB_PORT,
  ENGINE_READY_TIMEOUT_MS,
  WEB_READY_TIMEOUT_MS,
  isPortOpen,
  waitForHttp,
  start,
  stopAll,
  resolveRoot,
  resolveDataRoot,
  DEFAULT_DATA_ROOT,
  log,
};
