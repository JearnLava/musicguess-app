const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close: () => ipcRenderer.send('win-close'),
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  
  getVersion: () => ipcRenderer.invoke('get-version'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, data) => callback(data)),
  relaunch: () => ipcRenderer.send('relaunch-app'),

  sendToken: (token) => ipcRenderer.send('send-token', token),
  onMatchStatus: (callback) => ipcRenderer.on('match-status', (_, room) => callback(room))
})