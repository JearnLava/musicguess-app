const { app, BrowserWindow, ipcMain, shell, Menu, Tray } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const DiscordRPC = require('discord-rpc')

const DISCORD_CLIENT_ID = '1514185340447887420'
const API_HOST = 'https://musicguess.net'

let mainWindow
let settingsWindow
let tray = null
let rpc = null
let rpcReady = false
let currentRoomState = null

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS = {
  autoUpdate: true,
  autostart: true,
  minimizeToTray: false,
  fullscreen: false,
  hardwareAcceleration: true,
  
  quickActions: [
    { label: 'Hauptmenü', url: 'https://musicguess.net' }
  ]
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }
    }
  } catch {}
  return DEFAULT_SETTINGS
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  applySettings(settings)
}

function applySettings(settings) {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: settings.autostart,
      openAsHidden: settings.minimizeToTray,
      args: settings.minimizeToTray ? ['--hidden'] : []
    })
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(settings.fullscreen)
  }
  if (settings.minimizeToTray) createTray(); else destroyTray();
}

function createTray() {
  if (tray) return
  tray = new Tray(path.join(__dirname, 'assets/favicon.png'))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'MusicGuess öffnen', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Beenden', click: () => { destroyTray(); app.quit(); } }
  ])
  tray.setToolTip('MusicGuess')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => showMainWindow())
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null; }
}

function showMainWindow() {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
}

function initDiscordRPC() {

  rpc = new DiscordRPC.Client({ transport: 'ipc' })

  rpc.on('ready', () => {
    console.log('[Discord RPC] Verbindung erfolgreich hergestellt')
    rpcReady = true
    updateDiscordPresence(null)
  })

  rpc.on('error', (err) => {
    console.error('[Discord RPC] Fehler aufgetreten:', err.message)
  })

  rpc.login({ clientId: DISCORD_CLIENT_ID }).catch((err) => {
    console.warn('[Discord RPC] Login fehlgeschlagen (evtl. kein Discord geöffnet):', err.message)
    rpcReady = false
    rpc = null
  })
}

function updateDiscordPresence(room) {
  if (!rpc || !rpcReady) {
    console.warn('[Discord RPC] Nicht bereit');
    return;
  }

  try {
    if (room && room.code) {
      const modeName = room.mode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      console.log(`[Discord RPC] Setze In-Game Status: ${modeName} (${room.code})`);

      rpc.setActivity({
        details: `Mode: ${modeName}`,
        state: `Round ${room.roundNumber}/${room.totalRounds} • ${room.playerCount}/${room.maxPlayers} Spieler`,
        startTimestamp: currentRoomState && currentRoomState.code === room.code ? currentRoomState.start : Date.now(),
        largeImageKey: 'logo',
        largeImageText: 'MusicGuess Desktop',
        smallImageKey: room.phase === 'playing' ? 'play' : 'pause',
        smallImageText: room.phase === 'playing' ? 'Playing' : 'In Lobby',
        instance: false,
      }).then(() => {
        console.log('[Discord RPC] setActivity erfolgreich gesendet');
      }).catch((err) => {
        console.error('[Discord RPC] setActivity FEHLER:', err);
      });

    } else {
      rpc.setActivity({
        details: 'Im Hauptmenü',
        state: 'Suche nach einem Raum...',
        largeImageKey: 'logo',
        largeImageText: 'MusicGuess Desktop',
        instance: false,
      });
    }
  } catch (e) {
    console.error('[Discord RPC] Allgemeiner Fehler:', e);
  }
}

async function handleIncomingToken(token) {
  if (!token) {
    console.log('[API Loop] Kein Token im localStorage gefunden (Nicht eingeloggt).')
    updateDiscordPresence(null)
    sendMatchStatusToWindow(null)
    return
  }

  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString())
    
    if (!payload.accountId) {
      console.warn('[API Loop] Fehler: Keine accountId im Token-Payload gefunden.')
      return
    }

    const apiUrl = `${API_HOST}/api/public/user/${payload.accountId}`
    
    console.log(`[API Request] Sende GET an: ${apiUrl}`)
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MusicGuess-Desktop-App'
      }
    })
    
    console.log(`[API Response] Server-Status: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      const errText = await response.text().catch(() => 'Kein Inhalt')
      console.error(`[API Error] Unsaubere Antwort (${response.status}). Body:`, errText)
      updateDiscordPresence(null)
      sendMatchStatusToWindow(null)
      return
    }
    
    const room = await response.json()
    console.log('[DEBUG] Raw room data:', JSON.stringify(room, null, 2));
    if (!room || Object.keys(room).length === 0) {
      console.warn('[DEBUG] Room data ist leer/null – kein In-Game Status möglich');
    }

    updateDiscordPresence(room)
    sendMatchStatusToWindow(room)

  } catch (err) {
    console.error('[API Exception] Schwerwiegender Fehler beim Abruf oder Parsen:', err.message)
    updateDiscordPresence(null)
    sendMatchStatusToWindow(null)
  }
}

function sendMatchStatusToWindow(room) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('match-status', room)
  }
}

const initialSettings = loadSettings()
if (!initialSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration()
}

function createMainWindow() {
  const settings = loadSettings()
  const shouldStartMinimized = settings.autostart && settings.minimizeToTray && process.argv.includes('--hidden')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    fullscreen: settings.fullscreen,
    show: !shouldStartMinimized,
    backgroundColor: '#0f0f23',
    icon: path.join(__dirname, 'assets/favicon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
  })

  mainWindow.loadFile('renderer.html')
  
  if (!shouldStartMinimized) {
    mainWindow.once('ready-to-show', () => mainWindow.show())
  }

  mainWindow.on('close', (event) => {
    const currentSettings = loadSettings()
    if (currentSettings.minimizeToTray) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
}

function createSettingsWindow() {
  if (settingsWindow) return settingsWindow.focus()
  settingsWindow = new BrowserWindow({
    width: 440,
    height: 560,
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
ipcMain.on('win-close',     () => {
  if (loadSettings().minimizeToTray) mainWindow.hide(); else mainWindow.close();
})
ipcMain.on('open-settings', () => createSettingsWindow())
ipcMain.on('close-settings',() => settingsWindow?.close())
ipcMain.on('open-external', (_, url) => shell.openExternal(url))

ipcMain.on('send-token', (_, token) => handleIncomingToken(token))

ipcMain.handle('get-version',  () => app.getVersion())
ipcMain.handle('get-settings', () => loadSettings())
ipcMain.handle('save-settings', (_, s) => { saveSettings(s); return true })
ipcMain.handle('check-update', async () => {
  if (!app.isPackaged) return { success: true, isDev: true }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { success: true, result }
  } catch (e) { return { success: false, error: e.message } }
})
ipcMain.on('install-update', () => { destroyTray(); autoUpdater.quitAndInstall(); })

app.whenReady().then(() => {
  createMainWindow()
  initDiscordRPC()
  applySettings(loadSettings())
})

app.on('window-all-closed', () => {
  if (!loadSettings().minimizeToTray && process.platform !== 'darwin') {
    destroyTray(); app.quit();
  }
})