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
  getPreview: (id) => ipcRenderer.invoke('vault:preview', id),
  getAgentStatus: () => ipcRenderer.invoke('agent:status'),
  askAgent: (question, focusedIds) => ipcRenderer.invoke('agent:ask', question, focusedIds),
  openInbox: () => ipcRenderer.invoke('vault:open-inbox'),
  zoomIn: () => ipcRenderer.invoke('app:zoom', 'in'),
  zoomOut: () => ipcRenderer.invoke('app:zoom', 'out'),
  zoomReset: () => ipcRenderer.invoke('app:zoom', 'reset'),
  updateSettings: (settings: Partial<Pick<VaultSettings, 'staleDays' | 'launchAtStartup' | 'theme' | 'agentModel' | 'accentColor' | 'backgroundColor' | 'windowOpacity'>>) => ipcRenderer.invoke('vault:update-settings', settings),
  onVaultChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  },
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('tempVault', api)
