const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')

let mainWindow
let settingsWindow

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath))
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {}
  return { autoUpdate: true }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f0f23',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadFile('renderer.html')
}

function createSettingsWindow() {
  if (settingsWindow) return settingsWindow.focus()

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 500,
    parent: mainWindow,
    modal: true,
    frame: false,
    resizable: false,
    backgroundColor: '#13131f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  settingsWindow.loadFile('settings.html')
  settingsWindow.on('closed', () => (settingsWindow = null))
}

ipcMain.on('win-minimize',  () => mainWindow.minimize())
ipcMain.on('win-maximize',  () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.on('win-close',     () => mainWindow.close())
ipcMain.on('open-settings', () => createSettingsWindow())
ipcMain.on('close-settings',() => settingsWindow?.close())

ipcMain.handle('get-version',  () => app.getVersion())
ipcMain.handle('get-settings', () => loadSettings())
ipcMain.handle('save-settings', (_, s) => { saveSettings(s); return true })

ipcMain.handle('check-update', async () => {
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.on('install-update', () => autoUpdater.quitAndInstall())

function setupUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  const send = (data) => mainWindow?.webContents.send('update-status', data)

  autoUpdater.on('checking-for-update',  () => send({ type: 'checking' }))
  autoUpdater.on('update-not-available', () => send({ type: 'none' }))
  autoUpdater.on('error',       (e)    => send({ type: 'error', message: e.message }))

  autoUpdater.on('update-available', (info) => {
    send({ type: 'available', version: info.version })
  })

  autoUpdater.on('download-progress', (p) => {
    const pct = Math.round(p.percent)
    mainWindow.setProgressBar(pct / 100)
    send({ type: 'progress', percent: pct })
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.setProgressBar(-1)
    send({ type: 'downloaded' })
  })

  if (loadSettings().autoUpdate) {
    setTimeout(() => autoUpdater.checkForUpdates(), 5000)
  }
}

app.whenReady().then(() => {
  createMainWindow()
  setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})