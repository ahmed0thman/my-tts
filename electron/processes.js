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

/** Resolve paths that differ between `npm run electron` and a packaged .app. */
function resolveRoot() {
  // In development this file lives at <repo>/electron/; packaged, the app's
  // resources are unpacked next to the executable.
  const devRoot = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(devRoot, 'package.json'))) return devRoot;
  return process.resourcesPath;
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
  log,
};
