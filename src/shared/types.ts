export const CATEGORIES = [
  'Images', 'Videos', 'Audio', 'Documents', 'Spreadsheets', 'Presentations',
  'Archives', 'Installers', 'Code', 'Fonts', 'Folders', 'Other'
] as const

export type Category = (typeof CATEGORIES)[number]
export type VaultStatus = 'temporary' | 'kept'

export interface VaultItem {
  id: string
  path: string
  name: string
  extension: string
  category: Category
  status: VaultStatus
  size: number
  modifiedAt: number
  addedAt: number
}

export interface VaultSettings {
  storageRoot: string
  staleDays: number
  launchAtStartup: boolean
  theme: 'dark' | 'light'
  agentModel: string
}

export type PreviewKind = 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'folder' | 'unsupported'

export interface FilePreview {
  item: VaultItem
  kind: PreviewKind
  mimeType: string
  content?: string
  dataUrl?: string
  truncated?: boolean
  message?: string
}

export interface AgentStatus {
  available: boolean
  models: string[]
  activeModel: string
  message: string
}

export interface AgentAnswer {
  answer: string
  sources: Array<{ id: string; name: string }>
  model: string
}

export interface VaultSnapshot {
  items: VaultItem[]
  settings: VaultSettings
  totals: { bytes: number; temporary: number; kept: number; stale: number }
}

export interface OperationResult {
  succeeded: string[]
  failed: Array<{ path: string; reason: string }>
}

export interface TempVaultApi {
  getSnapshot(): Promise<VaultSnapshot>
  addFiles(paths?: string[]): Promise<OperationResult>
  addFolder(path?: string): Promise<OperationResult>
  keep(ids: string[]): Promise<OperationResult>
  restore(ids: string[]): Promise<OperationResult>
  trash(ids: string[]): Promise<OperationResult>
  moveOut(ids: string[]): Promise<OperationResult>
  openItem(id: string): Promise<void>
  revealItem(id: string): Promise<void>
  getPreview(id: string): Promise<FilePreview>
  getAgentStatus(): Promise<AgentStatus>
  askAgent(question: string, focusedIds?: string[]): Promise<AgentAnswer>
  openInbox(): Promise<void>
  updateSettings(settings: Partial<Pick<VaultSettings, 'staleDays' | 'launchAtStartup' | 'theme' | 'agentModel'>>): Promise<VaultSettings>
  onVaultChanged(callback: () => void): () => void
}
