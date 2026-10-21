const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('cadenceDesktop', Object.freeze({
  isDesktopCompanion: true,
  platform: process.platform
}));
