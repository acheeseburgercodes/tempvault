import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { TempVaultApi, VaultSettings } from '../shared/types'

const api: TempVaultApi & { pathForFile(file: File): string } = {
  getSnapshot: () => ipcRenderer.invoke('vault:snapshot'),
  addFiles: (paths) => ipcRenderer.invoke('vault:add-files', paths),
  addFolder: (path) => ipcRenderer.invoke('vault:add-folder', path),
  keep: (ids) => ipcRenderer.invoke('vault:keep', ids),
  restore: (ids) => ipcRenderer.invoke('vault:restore', ids),
  trash: (ids) => ipcRenderer.invoke('vault:trash', ids),
  moveOut: (ids) => ipcRenderer.invoke('vault:move-out', ids),
  openItem: (id) => ipcRenderer.invoke('vault:open', id),
  revealItem: (id) => ipcRenderer.invoke('vault:reveal', id),
  openInbox: () => ipcRenderer.invoke('vault:open-inbox'),
  updateSettings: (settings: Partial<Pick<VaultSettings, 'staleDays' | 'launchAtStartup'>>) => ipcRenderer.invoke('vault:update-settings', settings),
  onVaultChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  },
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('tempVault', api)
