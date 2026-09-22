'use strict';

/**
 * The splash window's only job is to display status lines the main process
 * sends while the servers boot. Nothing else is exposed — the app window runs
 * with contextIsolation and no Node access, exactly as it would in a browser.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bootStatus', {
  onStatus: (callback) => ipcRenderer.on('status', (_event, message) => callback(message)),
});
