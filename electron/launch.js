'use strict';

/**
 * Launches Electron with a clean environment.
 *
 * `ELECTRON_RUN_AS_NODE=1` is exported by some editors (VS Code sets it for its
 * extension host), and any terminal inheriting it makes the `electron` binary
 * behave as plain Node: `app` comes back undefined and main.js dies on its
 * first line. Clearing it here rather than in an npm script keeps this working
 * on Windows too, where `VAR= cmd` is not valid shell.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

// Required from Node (not Electron), the module exports the binary's path.
const electronBinary = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [path.resolve(__dirname, '..'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
