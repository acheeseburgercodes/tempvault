import { readFile, readdir } from 'node:fs/promises'
import { extname } from 'node:path'
import type { FilePreview, VaultItem } from '../shared/types'
import { VaultService } from './vault'
import { OfficeParser } from 'officeparser'
import WordExtractor from 'word-extractor'

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
const MAX_OFFICE_BYTES = 40_000_000
const RICH_OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.rtf'])
const LEGACY_WORD_EXTENSIONS = new Set(['.doc'])

async function officePreview(item: VaultItem, extension: string): Promise<FilePreview> {
  if (item.size > MAX_OFFICE_BYTES) return { item, kind: 'unsupported', mimeType: 'application/octet-stream', message: 'Office preview is limited to files smaller than 40 MB.' }
  const ast = await OfficeParser.parseOffice(item.path, { extractAttachments: true, ignoreSlideMasters: true })
  const [{ value: html }, { value: text }] = await Promise.all([
    ast.to('html', {
      includeFormatting: true,
      includeImages: true,
      includeCharts: false,
      htmlConfig: {
        standalone: true,
        containerWidth: '100%',
        customCss: 'html,body{margin:0!important;min-width:0!important;background:#fff!important;color:#111!important;font-family:Segoe UI,Arial,sans-serif!important}body{padding:20px!important;box-sizing:border-box!important}img,svg,table{max-width:100%!important}table{border-collapse:collapse!important}td,th{border:1px solid #d6d6d6!important;padding:5px!important}.slide{margin:0 auto 18px!important;box-shadow:0 8px 26px rgba(0,0,0,.15)!important}'
      }
    }),
    ast.to('text')
  ])
  const plainText = String(text).trim()
  return {
    item,
    kind: 'html',
    mimeType: extension === '.pptx' || extension === '.odp' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : extension === '.xlsx' || extension === '.ods' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: String(html),
    plainText: plainText.slice(0, MAX_TEXT_BYTES),
    truncated: plainText.length > MAX_TEXT_BYTES,
    message: 'Rendered locally with OfficeParser.'
  }
}

async function legacyWordPreview(item: VaultItem): Promise<FilePreview> {
  const extractor = new WordExtractor()
  const document = await extractor.extract(item.path)
  const text = [document.getHeaders(), document.getBody(), document.getFootnotes(), document.getEndnotes()].filter(Boolean).join('\n\n').trim()
  return { item, kind: 'text', mimeType: 'application/msword', content: text.slice(0, MAX_TEXT_BYTES), plainText: text.slice(0, MAX_TEXT_BYTES), truncated: text.length > MAX_TEXT_BYTES, message: 'Legacy Word document rendered as readable text.' }
}

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

  if (RICH_OFFICE_EXTENSIONS.has(extension)) return officePreview(item, extension)
  if (LEGACY_WORD_EXTENSIONS.has(extension)) return legacyWordPreview(item)

  if (TEXT_EXTENSIONS.has(extension) || (!extension && item.size < MAX_TEXT_BYTES)) {
    const buffer = await readFile(item.path)
    const slice = buffer.subarray(0, MAX_TEXT_BYTES)
    return { item, kind: 'text', mimeType: 'text/plain', content: slice.toString('utf8'), plainText: slice.toString('utf8'), truncated: buffer.length > slice.length }
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
    if (preview.kind === 'text' || preview.kind === 'folder' || preview.kind === 'html') return `${header}CONTENT:\n${(preview.plainText ?? preview.content ?? '').slice(0, maxCharacters)}`
    return `${header}CONTENT: [${preview.kind} binary file; metadata available, inline text extraction unavailable]`
  } catch (error) {
    return `${header}CONTENT: [unreadable: ${error instanceof Error ? error.message : String(error)}]`
  }
}
