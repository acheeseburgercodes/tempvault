import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import chokidar, { type FSWatcher } from 'chokidar'
import { VaultService } from './vault'
import type { OperationResult, VaultSettings } from '../shared/types'

const service = new VaultService()
let mainWindow: BrowserWindow | null = null
let watcher: FSWatcher | null = null
let sortTimer: NodeJS.Timeout | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d1117', symbolColor: '#d9e2f2', height: 44 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

async function notifyChanged(): Promise<void> {
  mainWindow?.webContents.send('vault:changed')
}

async function startWatcher(): Promise<void> {
  await watcher?.close()
  watcher = chokidar.watch(service.root, { ignoreInitial: true, depth: 4, awaitWriteFinish: { stabilityThreshold: 1_500, pollInterval: 150 } })
  watcher.on('all', (_event, path) => {
    if (path.toLowerCase().startsWith(service.inbox.toLowerCase())) {
      if (sortTimer) clearTimeout(sortTimer)
      sortTimer = setTimeout(async () => {
        await service.sortInbox()
        await notifyChanged()
      }, 2_100)
    } else void notifyChanged()
  })
}

function registerIpc(): void {
  ipcMain.handle('vault:snapshot', () => service.snapshot())
  ipcMain.handle('vault:add-files', async (_event, paths?: string[]) => {
    if (paths?.length) return finish(service.ingest(paths))
    const selected = await dialog.showOpenDialog(mainWindow!, { title: 'Move files into TempVault', properties: ['openFile', 'multiSelections'] })
    return selected.canceled ? emptyResult() : finish(service.ingest(selected.filePaths))
  })
  ipcMain.handle('vault:add-folder', async (_event, path?: string) => {
    if (path) return finish(service.ingest([path]))
    const selected = await dialog.showOpenDialog(mainWindow!, { title: 'Move a folder into TempVault', properties: ['openDirectory'] })
    return selected.canceled ? emptyResult() : finish(service.ingest(selected.filePaths))
  })
  ipcMain.handle('vault:keep', (_event, ids: string[]) => finish(service.changeStatus(ids, 'kept')))
  ipcMain.handle('vault:restore', (_event, ids: string[]) => finish(service.changeStatus(ids, 'temporary')))
  ipcMain.handle('vault:trash', async (_event, ids: string[]) => {
    const result = emptyResult()
    for (const item of await service.resolveIds(ids)) {
      try {
        service.assertInsideVault(item.path)
        await shell.trashItem(item.path)
        result.succeeded.push(item.path)
      } catch (error) {
        result.failed.push({ path: item.path, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    await notifyChanged()
    return result
  })
  ipcMain.handle('vault:move-out', async (_event, ids: string[]) => {
    const selected = await dialog.showOpenDialog(mainWindow!, { title: 'Move selected items to…', properties: ['openDirectory', 'createDirectory'] })
    return selected.canceled ? emptyResult() : finish(service.moveOut(ids, selected.filePaths[0]))
  })
  ipcMain.handle('vault:open', async (_event, id: string) => {
    const [item] = await service.resolveIds([id])
    if (item) await shell.openPath(item.path)
  })
  ipcMain.handle('vault:reveal', async (_event, id: string) => {
    const [item] = await service.resolveIds([id])
    if (item) shell.showItemInFolder(item.path)
  })
  ipcMain.handle('vault:open-inbox', () => shell.openPath(service.inbox))
  ipcMain.handle('vault:update-settings', async (_event, patch: Partial<Pick<VaultSettings, 'staleDays' | 'launchAtStartup'>>) => {
    const current = await service.getSettings()
    const settings: VaultSettings = {
      ...current,
      staleDays: Number.isInteger(patch.staleDays) ? Math.max(1, Math.min(365, patch.staleDays!)) : current.staleDays,
      launchAtStartup: patch.launchAtStartup ?? current.launchAtStartup
    }
    await service.saveSettings(settings)
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup })
    await notifyChanged()
    return settings
  })
}

async function finish(operation: Promise<OperationResult>): Promise<OperationResult> {
  const result = await operation
  await notifyChanged()
  return result
}

function emptyResult(): OperationResult { return { succeeded: [], failed: [] } }

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()
else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const paths = argv.filter((arg) => !arg.startsWith('-') && arg !== process.execPath)
    if (paths.length) void finish(service.ingest(paths))
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.tempvault.app')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
    await service.initialize()
    await service.sortInbox()
    registerIpc()
    createWindow()
    await startWatcher()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { void watcher?.close() })
