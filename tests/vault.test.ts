import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { VaultService } from '../src/main/vault'
import { createPreview } from '../src/main/preview'

describe('VaultService', () => {
  it('sorts ingested files, resolves collisions, and changes status', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tempvault-test-'))
    const service = new VaultService(join(sandbox, 'vault'))
    const incoming = join(sandbox, 'incoming')
    await mkdir(incoming)
    const first = join(incoming, 'notes.txt')
    await writeFile(first, 'first')
    expect((await service.ingest([first])).failed).toHaveLength(0)
    await writeFile(first, 'second')
    await service.ingest([first])
    let snapshot = await service.snapshot()
    expect(snapshot.items.map((item) => item.name).sort()).toEqual(['notes (1).txt', 'notes.txt'])
    expect(snapshot.items.every((item) => item.category === 'Documents')).toBe(true)
    await service.changeStatus([snapshot.items[0].id], 'kept')
    snapshot = await service.snapshot()
    expect(snapshot.totals.kept).toBe(1)
  })

  it('sorts stable inbox files and ignores partial downloads', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tempvault-inbox-'))
    const service = new VaultService(join(sandbox, 'vault'))
    await service.initialize()
    await writeFile(join(service.inbox, 'archive.zip'), 'content')
    await writeFile(join(service.inbox, 'video.mp4.part'), 'content')
    await new Promise((resolve) => setTimeout(resolve, 2_050))
    const result = await service.sortInbox()
    expect(result.succeeded).toHaveLength(1)
    expect((await service.snapshot()).items[0].category).toBe('Archives')
    expect(await readFile(join(service.inbox, 'video.mp4.part'), 'utf8')).toBe('content')
  })

  it('rejects unsafe managed paths', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tempvault-safe-'))
    const service = new VaultService(join(sandbox, 'vault'))
    await service.initialize()
    expect(() => service.assertInsideVault(join(sandbox, 'outside.txt'))).toThrow(/outside/)
    expect(() => service.assertOutsideVault(service.inbox)).toThrow(/already inside/)
    await expect(stat(service.root)).resolves.toBeDefined()
  })

  it('creates a bounded text preview for managed files', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tempvault-preview-'))
    const service = new VaultService(join(sandbox, 'vault'))
    const source = join(sandbox, 'context.md')
    await writeFile(source, '# Local context\nOnly on this machine.')
    await service.ingest([source])
    const [item] = (await service.snapshot()).items
    const preview = await createPreview(service, item.id)
    expect(preview.kind).toBe('text')
    expect(preview.content).toContain('Only on this machine')
    expect(preview.item.path.startsWith(service.root)).toBe(true)
  })
})
