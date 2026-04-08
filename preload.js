const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  minimize:      () => ipcRenderer.send('win-minimize'),
  maximize:      () => ipcRenderer.send('win-maximize'),
  close:         () => ipcRenderer.send('win-close'),
  openSettings:  () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  installUpdate: () => ipcRenderer.send('install-update'),

  getVersion:   () => ipcRenderer.invoke('get-version'),
  getSettings:  () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  checkUpdate:  () => ipcRenderer.invoke('check-update'),

  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_, d) => cb(d)),
})