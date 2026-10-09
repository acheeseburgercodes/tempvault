import { readFile, readdir } from 'node:fs/promises'
import { extname } from 'node:path'
import type { FilePreview, VaultItem } from '../shared/types'
import { VaultService } from './vault'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml', '.toml', '.ini', '.log',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html', '.py', '.java', '.c', '.cpp', '.h',
  '.cs', '.go', '.rs', '.sh', '.ps1', '.sql', '.env', '.gitignore'
])

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime'
}

const MAX_TEXT_BYTES = 1_500_000
const MAX_MEDIA_BYTES = 24_000_000

export async function createPreview(service: VaultService, id: string): Promise<FilePreview> {
  const [item] = await service.resolveIds([id])
  if (!item) throw new Error('File is no longer in the vault')
  service.assertInsideVault(item.path)
  const extension = extname(item.name).toLowerCase()

  if (item.category === 'Folders') {
    const children = await readdir(item.path, { withFileTypes: true })
    return {
      item, kind: 'folder', mimeType: 'inode/directory',
      content: children.slice(0, 200).map((entry) => `${entry.isDirectory() ? 'DIR ' : 'FILE'}  ${entry.name}`).join('\n'),
      truncated: children.length > 200,
      message: `${children.length} item${children.length === 1 ? '' : 's'}`
    }
  }

  if (TEXT_EXTENSIONS.has(extension) || (!extension && item.size < MAX_TEXT_BYTES)) {
    const buffer = await readFile(item.path)
    const slice = buffer.subarray(0, MAX_TEXT_BYTES)
    return { item, kind: 'text', mimeType: 'text/plain', content: slice.toString('utf8'), truncated: buffer.length > slice.length }
  }

  const mimeType = MIME_TYPES[extension] ?? 'application/octet-stream'
  const kind = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : mimeType === 'application/pdf' ? 'pdf' : 'unsupported'
  if (kind !== 'unsupported' && item.size <= MAX_MEDIA_BYTES) {
    const buffer = await readFile(item.path)
    return { item, kind, mimeType, dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` }
  }
  return { item, kind: 'unsupported', mimeType, message: item.size > MAX_MEDIA_BYTES ? 'Preview is disabled for files larger than 24 MB.' : 'No inline preview is available for this format.' }
}

export async function contextForItem(service: VaultService, item: VaultItem, maxCharacters = 18_000): Promise<string> {
  const header = `FILE: ${item.name}\nTYPE: ${item.category}\nSIZE: ${item.size} bytes\nMODIFIED: ${new Date(item.modifiedAt).toISOString()}\n`
  try {
    const preview = await createPreview(service, item.id)
    if (preview.kind === 'text' || preview.kind === 'folder') return `${header}CONTENT:\n${(preview.content ?? '').slice(0, maxCharacters)}`
    return `${header}CONTENT: [${preview.kind} binary file; metadata available, inline text extraction unavailable]`
  } catch (error) {
    return `${header}CONTENT: [unreadable: ${error instanceof Error ? error.message : String(error)}]`
  }
}
