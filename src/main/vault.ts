import { createHash } from 'node:crypto'
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Category, OperationResult, VaultItem, VaultSettings, VaultSnapshot, VaultStatus } from '../shared/types'

const CATEGORY_EXTENSIONS: Record<Exclude<Category, 'Folders' | 'Other'>, string[]> = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff', '.heic', '.raw', '.psd'],
  Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
  Documents: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.epub'],
  Spreadsheets: ['.xls', '.xlsx', '.ods', '.csv', '.tsv'],
  Presentations: ['.ppt', '.pptx', '.odp', '.key'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso'],
  Installers: ['.exe', '.msi', '.msix', '.appx', '.apk', '.bat', '.cmd'],
  Code: ['.py', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.json', '.xml', '.yml', '.yaml', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.sh', '.ps1', '.sql', '.ipynb'],
  Fonts: ['.ttf', '.otf', '.woff', '.woff2']
}

const EXTENSION_CATEGORY = new Map<string, Category>(
  Object.entries(CATEGORY_EXTENSIONS).flatMap(([category, extensions]) =>
    extensions.map((extension) => [extension, category as Category] as const)
  )
)
const PARTIAL_EXTENSIONS = new Set(['.crdownload', '.part', '.partial', '.tmp', '.download'])
const DEFAULT_ROOT = process.env.TEMPVAULT_HOME || 'D:\\TempVault\\storage'

export class VaultService {
  readonly root: string
  readonly inbox: string
  readonly temporary: string
  readonly kept: string
  readonly configPath: string

  constructor(root = DEFAULT_ROOT) {
    if (!isAbsolute(root)) throw new Error('Vault storage path must be absolute')
    this.root = resolve(root)
    this.inbox = join(this.root, 'Inbox')
    this.temporary = join(this.root, 'Temporary')
    this.kept = join(this.root, 'Kept')
    this.configPath = join(this.root, 'config.json')
  }

  async initialize(): Promise<void> {
    await Promise.all([this.inbox, this.temporary, this.kept].map((path) => mkdir(path, { recursive: true })))
    if (!existsSync(this.configPath)) await this.saveSettings({ storageRoot: this.root, staleDays: 7, launchAtStartup: false })
  }

  async getSettings(): Promise<VaultSettings> {
    await this.initialize()
    try {
      const parsed = JSON.parse(await readFile(this.configPath, 'utf8')) as Partial<VaultSettings>
      return {
        storageRoot: this.root,
        staleDays: clampInteger(parsed.staleDays, 1, 365, 7),
        launchAtStartup: Boolean(parsed.launchAtStartup)
      }
    } catch {
      return { storageRoot: this.root, staleDays: 7, launchAtStartup: false }
    }
  }

  async saveSettings(settings: VaultSettings): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await writeFile(this.configPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  }

  categoryFor(path: string, isDirectory = false): Category {
    return isDirectory ? 'Folders' : (EXTENSION_CATEGORY.get(extname(path).toLowerCase()) ?? 'Other')
  }

  async ingest(paths: string[]): Promise<OperationResult> {
    await this.initialize()
    const result = emptyResult()
    for (const sourceInput of paths) {
      try {
        const source = resolve(sourceInput)
        this.assertOutsideVault(source)
        const sourceStat = await stat(source)
        if (PARTIAL_EXTENSIONS.has(extname(source).toLowerCase())) throw new Error('File is still downloading')
        const category = this.categoryFor(source, sourceStat.isDirectory())
        const month = new Date(sourceStat.mtimeMs).toISOString().slice(0, 7)
        const destination = await this.uniquePath(join(this.temporary, category, month, basename(source)))
        await mkdir(dirname(destination), { recursive: true })
        await movePath(source, destination)
        result.succeeded.push(destination)
      } catch (error) {
        result.failed.push({ path: sourceInput, reason: errorMessage(error) })
      }
    }
    return result
  }

  async sortInbox(): Promise<OperationResult> {
    await this.initialize()
    const entries = await readdir(this.inbox)
    const ready: string[] = []
    for (const entry of entries) {
      const path = join(this.inbox, entry)
      try {
        const info = await stat(path)
        if (!PARTIAL_EXTENSIONS.has(extname(path).toLowerCase()) && Date.now() - info.mtimeMs > 2_000) ready.push(path)
      } catch { /* item disappeared while scanning */ }
    }
    return this.ingestFromInbox(ready)
  }

  async snapshot(): Promise<VaultSnapshot> {
    await this.initialize()
    const settings = await this.getSettings()
    const items = [...(await this.scanBase(this.temporary, 'temporary')), ...(await this.scanBase(this.kept, 'kept'))]
    const staleBoundary = Date.now() - settings.staleDays * 86_400_000
    return {
      items,
      settings,
      totals: {
        bytes: items.reduce((sum, item) => sum + item.size, 0),
        temporary: items.filter((item) => item.status === 'temporary').length,
        kept: items.filter((item) => item.status === 'kept').length,
        stale: items.filter((item) => item.status === 'temporary' && item.modifiedAt < staleBoundary).length
      }
    }
  }

  async resolveIds(ids: string[]): Promise<VaultItem[]> {
    const snapshot = await this.snapshot()
    const wanted = new Set(ids)
    return snapshot.items.filter((item) => wanted.has(item.id))
  }

  async changeStatus(ids: string[], status: VaultStatus): Promise<OperationResult> {
    const result = emptyResult()
    const items = await this.resolveIds(ids)
    for (const item of items) {
      try {
        const sourceBase = item.status === 'temporary' ? this.temporary : this.kept
        const targetBase = status === 'temporary' ? this.temporary : this.kept
        if (sourceBase === targetBase) continue
        const destination = await this.uniquePath(join(targetBase, relative(sourceBase, item.path)))
        await mkdir(dirname(destination), { recursive: true })
        await movePath(item.path, destination)
        result.succeeded.push(destination)
      } catch (error) {
        result.failed.push({ path: item.path, reason: errorMessage(error) })
      }
    }
    await this.pruneEmptyDirectories()
    return result
  }

  async moveOut(ids: string[], destinationDirectory: string): Promise<OperationResult> {
    if (!isAbsolute(destinationDirectory)) throw new Error('Destination must be an absolute path')
    this.assertOutsideVault(destinationDirectory)
    const result = emptyResult()
    const items = await this.resolveIds(ids)
    for (const item of items) {
      try {
        this.assertInsideVault(item.path)
        const destination = await this.uniquePath(join(destinationDirectory, item.name))
        await movePath(item.path, destination)
        result.succeeded.push(destination)
      } catch (error) {
        result.failed.push({ path: item.path, reason: errorMessage(error) })
      }
    }
    await this.pruneEmptyDirectories()
    return result
  }

  assertInsideVault(path: string): void {
    const rel = relative(this.root, resolve(path))
    if (rel.startsWith('..') || isAbsolute(rel) || rel === '') throw new Error('Path is outside the managed vault')
  }

  assertOutsideVault(path: string): void {
    const rel = relative(this.root, resolve(path))
    if (!(rel.startsWith('..') || isAbsolute(rel))) throw new Error('Item is already inside TempVault')
  }

  private async ingestFromInbox(paths: string[]): Promise<OperationResult> {
    const result = emptyResult()
    for (const source of paths) {
      try {
        this.assertInsideVault(source)
        const sourceStat = await stat(source)
        const category = this.categoryFor(source, sourceStat.isDirectory())
        const month = new Date(sourceStat.mtimeMs).toISOString().slice(0, 7)
        const destination = await this.uniquePath(join(this.temporary, category, month, basename(source)))
        await mkdir(dirname(destination), { recursive: true })
        await movePath(source, destination)
        result.succeeded.push(destination)
      } catch (error) {
        result.failed.push({ path: source, reason: errorMessage(error) })
      }
    }
    return result
  }

  private async scanBase(base: string, status: VaultStatus): Promise<VaultItem[]> {
    const items: VaultItem[] = []
    for (const categoryEntry of await safeReadDir(base)) {
      const categoryPath = join(base, categoryEntry.name)
      if (!categoryEntry.isDirectory()) continue
      for (const monthEntry of await safeReadDir(categoryPath)) {
        const monthPath = join(categoryPath, monthEntry.name)
        if (!monthEntry.isDirectory()) continue
        for (const entry of await safeReadDir(monthPath)) {
          const path = join(monthPath, entry.name)
          try {
            const info = await stat(path)
            items.push({
              id: createHash('sha1').update(path.toLowerCase()).digest('hex'),
              path,
              name: entry.name,
              extension: entry.isDirectory() ? '' : extname(entry.name).slice(1).toLowerCase(),
              category: this.categoryFor(path, entry.isDirectory()),
              status,
              size: entry.isDirectory() ? await directorySize(path) : info.size,
              modifiedAt: info.mtimeMs,
              addedAt: info.birthtimeMs || info.ctimeMs
            })
          } catch { /* unreadable item */ }
        }
      }
    }
    return items
  }

  private async uniquePath(path: string): Promise<string> {
    if (!(await pathExists(path))) return path
    const extension = extname(path)
    const stem = basename(path, extension)
    for (let index = 1; ; index += 1) {
      const candidate = join(dirname(path), `${stem} (${index})${extension}`)
      if (!(await pathExists(candidate))) return candidate
    }
  }

  private async pruneEmptyDirectories(): Promise<void> {
    for (const base of [this.temporary, this.kept]) await pruneEmpty(base, base)
  }
}

async function movePath(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await cp(source, destination, { recursive: true, errorOnExist: true })
    await rm(source, { recursive: true })
  }
}

async function safeReadDir(path: string) {
  try { return await readdir(path, { withFileTypes: true }) } catch { return [] }
}

async function directorySize(path: string): Promise<number> {
  let total = 0
  for (const entry of await safeReadDir(path)) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += await directorySize(child)
    else { try { total += (await stat(child)).size } catch { /* unreadable */ } }
  }
  return total
}

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

async function pruneEmpty(path: string, root: string): Promise<void> {
  for (const entry of await safeReadDir(path)) if (entry.isDirectory()) await pruneEmpty(join(path, entry.name), root)
  if (path !== root && (await safeReadDir(path)).length === 0) await rm(path, { recursive: false })
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback
}

function emptyResult(): OperationResult { return { succeeded: [], failed: [] } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
