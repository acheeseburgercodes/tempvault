import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, type AgentAnswer, type AgentStatus, type Category, type FilePreview, type OperationResult, type VaultItem, type VaultSnapshot } from '../../shared/types'

type View = 'all' | 'temporary' | 'kept' | 'stale'
type SortKey = 'name' | 'category' | 'size' | 'modifiedAt'
type Panel = 'preview' | 'agent'
type FloatingWindow = { key: string; id: string; x: number; y: number; width: number; height: number; z: number }
type ChatMessage = { role: 'user' | 'assistant'; content: string; answer?: AgentAnswer }
type ContextState = { id: string; x: number; y: number } | null

const icons: Record<string, string> = { Images: 'IM', Videos: 'VI', Audio: 'AU', Documents: 'DO', Spreadsheets: 'SP', Presentations: 'PR', Archives: 'AR', Installers: 'IN', Code: 'CO', Fonts: 'FO', Folders: 'DI', Other: 'FI' }

export default function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null)
  const [view, setView] = useState<View>('all')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [hoverCategory, setHoverCategory] = useState<Category | 'all' | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'modifiedAt', descending: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewOrder, setPreviewOrder] = useState<string[]>([])
  const [previews, setPreviews] = useState<Record<string, FilePreview>>({})
  const [floating, setFloating] = useState<FloatingWindow[]>([])
  const [panel, setPanel] = useState<Panel>('preview')
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextState>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const next = await window.tempVault.getSnapshot()
    document.documentElement.dataset.theme = next.settings.theme
    document.documentElement.style.setProperty('--accent', next.settings.accentColor)
    document.documentElement.style.setProperty('--bg', next.settings.backgroundColor)
    setSnapshot(next)
    setSelected((current) => new Set([...current].filter((id) => next.items.some((item) => item.id === id))))
    setPreviewOrder((current) => current.filter((id) => next.items.some((item) => item.id === id)))
  }, [])

  useEffect(() => { void refresh(); return window.tempVault.onVaultChanged(() => void refresh()) }, [refresh])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3_500); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => {
    const ids = [...selected]
    setPreviewOrder((current) => [...current, ...ids.filter((id) => !current.includes(id))])
  }, [selected])
  useEffect(() => {
    for (const id of previewOrder) if (!previews[id]) void window.tempVault.getPreview(id).then((preview) => setPreviews((current) => ({ ...current, [id]: preview }))).catch((error) => setToast(error instanceof Error ? error.message : String(error)))
  }, [previewOrder, previews])
  useEffect(() => { const close = (): void => setContextMenu(null); window.addEventListener('pointerdown', close); window.addEventListener('blur', close); return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close) } }, [])

  const staleBoundary = Date.now() - (snapshot?.settings.staleDays ?? 7) * 86_400_000
  const effectiveCategory = hoverCategory ?? category
  const items = useMemo(() => {
    if (!snapshot) return []
    const query = search.trim().toLowerCase()
    return snapshot.items.filter((item) => {
      if (view === 'temporary' && item.status !== 'temporary') return false
      if (view === 'kept' && item.status !== 'kept') return false
      if (view === 'stale' && !(item.status === 'temporary' && item.modifiedAt < staleBoundary)) return false
      if (effectiveCategory !== 'all' && item.category !== effectiveCategory) return false
      return !query || `${item.name} ${item.extension} ${item.category}`.toLowerCase().includes(query)
    }).sort((a, b) => {
      const left = a[sort.key]; const right = b[sort.key]
      const compared = typeof left === 'string' ? left.localeCompare(String(right)) : left - Number(right)
      return sort.descending ? -compared : compared
    })
  }, [snapshot, search, view, effectiveCategory, sort, staleBoundary])
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { setPage(1) }, [search, view, category, hoverCategory])
  useEffect(() => { setPage((current) => Math.min(current, pageCount)) }, [pageCount])

  async function perform(label: string, task: () => Promise<OperationResult>): Promise<void> {
    setBusy(true)
    try {
      const result = await task(); setSelected(new Set()); await refresh()
      setToast(result.failed.length ? `${label}: ${result.succeeded.length} complete, ${result.failed.length} failed` : `${label}: ${result.succeeded.length} item${result.succeeded.length === 1 ? '' : 's'}`)
    } catch (error) { setToast(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  function toggleSort(key: SortKey): void { setSort((current) => ({ key, descending: current.key === key ? !current.descending : key !== 'name' && key !== 'category' })) }
  function openPreview(id: string): void { setPanel('preview'); setPreviewOrder((current) => current.includes(id) ? current : [...current, id]) }
  function toggleItem(id: string): void { setPanel('preview'); setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next }) }
  function selectRow(event: React.MouseEvent, id: string): void {
    setPanel('preview')
    if (event.ctrlKey || event.metaKey) toggleItem(id)
    else setSelected((current) => current.size === 1 && current.has(id) ? new Set() : new Set([id]))
  }

  async function handleFileDrop(event: React.DragEvent): Promise<void> {
    event.preventDefault(); setDraggingFiles(false)
    const paths = Array.from(event.dataTransfer.files).map((file) => window.tempVault.pathForFile(file)).filter(Boolean)
    if (paths.length) await perform('Added', () => window.tempVault.addFiles(paths))
  }

  function createFloating(id: string, clientX?: number, clientY?: number): void {
    const bounds = workspaceRef.current?.getBoundingClientRect()
    const x = bounds && clientX ? Math.max(20, Math.min(bounds.width - 390, clientX - bounds.left - 170)) : 80 + floating.length * 28
    const y = bounds && clientY ? Math.max(70, Math.min(bounds.height - 330, clientY - bounds.top - 24)) : 90 + floating.length * 28
    const z = Math.max(0, ...floating.map((window) => window.z)) + 1
    setFloating((current) => [...current, { key: `${id}-${Date.now()}`, id, x, y, width: 380, height: 320, z }])
  }

  function handleWorkspaceDrop(event: React.DragEvent): void {
    const id = event.dataTransfer.getData('application/x-tempvault-preview')
    if (!id) return
    event.preventDefault(); createFloating(id, event.clientX, event.clientY)
  }

  function updateFloating(key: string, patch: Partial<FloatingWindow>): void { setFloating((current) => current.map((window) => window.key === key ? { ...window, ...patch } : window)) }
  function focusFloating(key: string): void { const z = Math.max(0, ...floating.map((window) => window.z)) + 1; updateFloating(key, { z }) }

  async function trashSelected(): Promise<void> {
    if (selected.size && window.confirm(`Send ${selected.size} selected item${selected.size === 1 ? '' : 's'} to the Recycle Bin?`)) await perform('Recycled', () => window.tempVault.trash([...selected]))
  }

  if (!snapshot) return <div className="loading"><div className="vault-mark">TV</div><span>OPENING VAULT</span></div>
  const selectedItems = snapshot.items.filter((item) => selected.has(item.id))

  return (
    <div className="app-shell" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingFiles(true) } }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFiles(false) }} onDrop={(event) => { if (event.dataTransfer.files.length) void handleFileDrop(event) }}>
      <header className="titlebar"><div className="brand"><span className="vault-mark small">TV</span><span>TEMPVAULT</span><em>LOCAL ONLY</em></div><div className="title-actions"><button title="Ask the local agent" onClick={() => setPanel('agent')}>AI</button><button title="Toggle light mode" onClick={() => { const theme = snapshot.settings.theme === 'dark' ? 'light' : 'dark'; void window.tempVault.updateSettings({ theme, backgroundColor: theme === 'light' ? '#ffffff' : '#000000' }).then(refresh) }}>{snapshot.settings.theme === 'dark' ? '☼' : '◐'}</button></div></header>
      <aside className="sidebar">
        <div className="nav-section"><span>LIBRARY</span><Nav active={view === 'all'} label="All files" count={snapshot.items.length} glyph="01" onClick={() => setView('all')} /><Nav active={view === 'temporary'} label="Temporary" count={snapshot.totals.temporary} glyph="02" onClick={() => setView('temporary')} /><Nav active={view === 'kept'} label="Kept" count={snapshot.totals.kept} glyph="03" onClick={() => setView('kept')} /><Nav active={view === 'stale'} label="Review" count={snapshot.totals.stale} glyph="04" onClick={() => setView('stale')} /></div>
        <div className="nav-section"><span>TOOLS</span><button className={`nav-item ${panel === 'preview' ? 'active' : ''}`} onClick={() => setPanel('preview')}><i>PV</i><b>Previews</b><small>{previewOrder.length}</small></button><button className={`nav-item ${panel === 'agent' ? 'active' : ''}`} onClick={() => setPanel('agent')}><i>AI</i><b>File agent</b><small>LOCAL</small></button><button className="nav-item" onClick={() => void window.tempVault.openInbox()}><i>IN</i><b>Watched inbox</b></button></div>
        <div className="storage-block"><div><span>STORAGE</span><strong>{formatBytes(snapshot.totals.bytes)}</strong></div><p title={snapshot.settings.storageRoot}>{snapshot.settings.storageRoot}</p></div>
        <button className="settings-link" onClick={() => setSettingsOpen(true)}>SETTINGS <span>→</span></button>
      </aside>

      <main className="workspace" ref={workspaceRef} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-tempvault-preview')) event.preventDefault() }} onDrop={handleWorkspaceDrop}>
        <section className="workspace-head"><div><p className="kicker">FILES / {view.toUpperCase()}</p><h1>{viewTitle(view)}</h1><p>{snapshot.items.length} records · {formatBytes(snapshot.totals.bytes)} on disk</p></div><div className="head-actions"><button onClick={() => void perform('Added', () => window.tempVault.addFolder())}>NEW FOLDER IMPORT</button><button className="solid" onClick={() => void perform('Added', () => window.tempVault.addFiles())}>＋ ADD FILES</button></div></section>
        <section className="metrics"><Metric label="TOTAL" value={snapshot.items.length} /><Metric label="TEMPORARY" value={snapshot.totals.temporary} /><Metric label="KEPT" value={snapshot.totals.kept} /><Metric label="REVIEW" value={snapshot.totals.stale} /></section>
        <section className="records">
          <div className="record-tools"><label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" /></label><ColorFilter value={category} hovered={hoverCategory} items={snapshot.items} onHover={setHoverCategory} onChange={setCategory} /><button onClick={() => void refresh()}>REFRESH</button></div>
          <div className={`bulk-slot ${selected.size ? 'visible' : ''}`} aria-hidden={!selected.size}><div className="bulk"><strong>{selected.size} SELECTED</strong><span>Selected files appear in the preview rail.</span><div><button disabled={busy} onClick={() => void perform('Kept', () => window.tempVault.keep([...selected]))}>KEEP</button><button disabled={busy} onClick={() => void perform('Temporary', () => window.tempVault.restore([...selected]))}>TEMPORARY</button><button disabled={busy} onClick={() => void perform('Moved', () => window.tempVault.moveOut([...selected]))}>MOVE OUT</button><button className="danger" disabled={busy} onClick={() => void trashSelected()}>RECYCLE</button><button onClick={() => setSelected(new Set())}>×</button></div></div></div>
          <div className="record-header"><div><input type="checkbox" checked={items.length > 0 && items.every((item) => selected.has(item.id))} onChange={() => { setPanel('preview'); setSelected(items.every((item) => selected.has(item.id)) ? new Set() : new Set(items.map((item) => item.id))) }} /></div><SortButton label="FILE RECORD" column="name" sort={sort} onClick={toggleSort} /><SortButton label="TYPE" column="category" sort={sort} onClick={toggleSort} /><span>STATE</span><SortButton label="SIZE" column="size" sort={sort} onClick={toggleSort} /><SortButton label="UPDATED" column="modifiedAt" sort={sort} onClick={toggleSort} /><span /></div>
          {pagedItems.map((item) => <FileRecord key={item.id} item={item} active={selected.has(item.id)} stale={item.status === 'temporary' && item.modifiedAt < staleBoundary} onToggle={toggleItem} onSelect={selectRow} onPreview={() => openPreview(item.id)} onContext={(event) => { event.preventDefault(); setContextMenu({ id: item.id, x: event.clientX, y: event.clientY }) }} />)}
          {!items.length && <div className="empty"><b>NO FILE RECORDS</b><p>{search || category !== 'all' ? 'Adjust the search or filter.' : 'Drop files anywhere or add your first record.'}</p></div>}
          {!!items.length && <Pagination page={page} count={pageCount} total={items.length} onChange={setPage} />}
        </section>
        {floating.map((windowState) => <FloatingPreview key={windowState.key} state={windowState} preview={previews[windowState.id]} onClose={() => setFloating((current) => current.filter((item) => item.key !== windowState.key))} onFocus={() => focusFloating(windowState.key)} onUpdate={(patch) => updateFloating(windowState.key, patch)} />)}
      </main>

      <aside className="right-rail" onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-tempvault-file')) { event.preventDefault(); event.currentTarget.classList.add('drop-ready') } }} onDragLeave={(event) => event.currentTarget.classList.remove('drop-ready')} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('drop-ready'); const id = event.dataTransfer.getData('application/x-tempvault-file'); if (id) openPreview(id) }}>
        <div className="rail-tabs"><button className={panel === 'preview' ? 'active' : ''} onClick={() => setPanel('preview')}>PREVIEW <span>{previewOrder.length}</span></button><button className={panel === 'agent' ? 'active' : ''} onClick={() => setPanel('agent')}>ASK AI</button></div>
        {panel === 'preview' ? <PreviewRail order={previewOrder} previews={previews} onOrder={setPreviewOrder} onFloat={createFloating} onRemove={(id) => setPreviewOrder((current) => current.filter((value) => value !== id))} /> : <AgentPanel selectedIds={[...selected]} settings={snapshot.settings} onSettings={() => setSettingsOpen(true)} />}
      </aside>
      <Dock onAdd={() => void perform('Added', () => window.tempVault.addFiles())} onInbox={() => void window.tempVault.openInbox()} onPreview={() => setPanel('preview')} onAgent={() => setPanel('agent')} onRefresh={() => void refresh()} onSettings={() => setSettingsOpen(true)} active={panel} />
      {contextMenu && <ContextMenu item={snapshot.items.find((item) => item.id === contextMenu.id)} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onPreview={() => openPreview(contextMenu.id)} onFloat={() => { openPreview(contextMenu.id); createFloating(contextMenu.id) }} onPerform={perform} />}
      {draggingFiles && <div className="file-drop"><div><b>DROP INTO TEMPVAULT</b><span>Files stay on this computer.</span></div></div>}
      {settingsOpen && <Settings snapshot={snapshot} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await refresh(); setToast('Settings saved') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

const filterColors: Record<Category | 'all', string> = {
  all: '#ffffff', Images: '#ff5c5c', Videos: '#ff9f43', Audio: '#ffd43b', Documents: '#5eead4',
  Spreadsheets: '#4ade80', Presentations: '#f472b6', Archives: '#a78bfa', Installers: '#fb7185',
  Code: '#60a5fa', Fonts: '#c084fc', Folders: '#22d3ee', Other: '#94a3b8'
}

function ColorFilter({ value, hovered, items, onHover, onChange }: { value: Category | 'all'; hovered: Category | 'all' | null; items: VaultItem[]; onHover(value: Category | 'all' | null): void; onChange(value: Category | 'all'): void }): React.JSX.Element {
  const options: Array<Category | 'all'> = ['all', ...CATEGORIES]
  return <div className="color-filter" onMouseLeave={() => onHover(null)}><button className="filter-trigger"><i style={{ background: filterColors[hovered ?? value] }} /><span>{(hovered ?? value) === 'all' ? 'ALL TYPES' : (hovered ?? value).toUpperCase()}</span><b>⌄</b></button><div className="filter-popover">{options.map((option) => { const count = option === 'all' ? items.length : items.filter((item) => item.category === option).length; const active = (hovered ?? value) === option; return <button key={option} className={active ? 'active' : ''} style={{ '--swatch': filterColors[option] } as React.CSSProperties} onMouseEnter={() => onHover(option)} onFocus={() => onHover(option)} onClick={() => { onChange(option); onHover(null) }}><i /><span>{option === 'all' ? 'All files' : option}</span><small>{count}</small></button> })}</div></div>
}

function Pagination({ page, count, total, onChange }: { page: number; count: number; total: number; onChange(page: number): void }): React.JSX.Element {
  const pages = Array.from({ length: count }, (_, index) => index + 1).filter((value) => count <= 7 || value === 1 || value === count || Math.abs(value - page) <= 1)
  return <nav className="pagination" aria-label="File pages"><span>{total} RECORDS</span><div><button disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>{pages.map((value, index) => <span key={value}>{index > 0 && value - pages[index - 1] > 1 && <i>…</i>}<button className={page === value ? 'active' : ''} onClick={() => onChange(value)}>{String(value).padStart(2, '0')}</button></span>)}<button disabled={page === count} onClick={() => onChange(page + 1)}>›</button></div></nav>
}

function Nav({ active, label, count, glyph, onClick }: { active: boolean; label: string; count: number; glyph: string; onClick(): void }): React.JSX.Element { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><i>{glyph}</i><b>{label}</b><small>{count}</small></button> }
function Metric({ label, value }: { label: string; value: number }): React.JSX.Element { return <article><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></article> }
function SortButton({ label, column, sort, onClick }: { label: string; column: SortKey; sort: { key: SortKey; descending: boolean }; onClick(key: SortKey): void }): React.JSX.Element { return <button onClick={() => onClick(column)}>{label}{sort.key === column ? (sort.descending ? ' ↓' : ' ↑') : ''}</button> }

function FileRecord({ item, active, stale, onToggle, onSelect, onPreview, onContext }: { item: VaultItem; active: boolean; stale: boolean; onToggle(id: string): void; onSelect(event: React.MouseEvent, id: string): void; onPreview(): void; onContext(event: React.MouseEvent): void }): React.JSX.Element {
  return <div className={`record-row ${active ? 'active' : ''}`} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-tempvault-file', item.id); event.dataTransfer.effectAllowed = 'copy'; event.currentTarget.classList.add('dragging') }} onDragEnd={(event) => event.currentTarget.classList.remove('dragging')} onContextMenu={onContext} onClick={(event) => onSelect(event, item.id)} onDoubleClick={onPreview}><div onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={active} onChange={() => onToggle(item.id)} /></div><div className="record-name"><i>{icons[item.category]}</i><div><strong title={item.name}>{item.name}</strong><small>{item.extension ? `.${item.extension}` : 'DIRECTORY'} · {shortPath(item.path)}</small></div></div><span>{item.category.toUpperCase()}</span><span className="state-tag">{stale ? 'REVIEW' : item.status.toUpperCase()}</span><span>{formatBytes(item.size)}</span><span>{relativeDate(item.modifiedAt)}</span><button title="Preview" onClick={(event) => { event.stopPropagation(); onPreview() }}>→</button></div>
}

function ContextMenu({ item, x, y, onClose, onPreview, onFloat, onPerform }: { item?: VaultItem; x: number; y: number; onClose(): void; onPreview(): void; onFloat(): void; onPerform(label: string, task: () => Promise<OperationResult>): Promise<void> }): React.JSX.Element | null {
  if (!item) return null
  const left = Math.min(x, window.innerWidth - 230); const top = Math.min(y, window.innerHeight - 330)
  const action = (task: () => void): void => { onClose(); task() }
  return <div className="context-menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}><header><i>{icons[item.category]}</i><div><strong>{item.name}</strong><span>{item.category} · {formatBytes(item.size)}</span></div></header><button onClick={() => action(onPreview)}><span>Open in preview rail</span><kbd>↵</kbd></button><button onClick={() => action(onFloat)}><span>Open floating preview</span><kbd>↗</kbd></button><hr /><button onClick={() => action(() => void window.tempVault.openItem(item.id))}><span>Open with default app</span><kbd>↥</kbd></button><button onClick={() => action(() => void window.tempVault.revealItem(item.id))}><span>Show in File Explorer</span><kbd>⌕</kbd></button><hr /><button onClick={() => action(() => void onPerform(item.status === 'kept' ? 'Temporary' : 'Kept', () => item.status === 'kept' ? window.tempVault.restore([item.id]) : window.tempVault.keep([item.id])))}><span>{item.status === 'kept' ? 'Make temporary' : 'Keep this file'}</span><kbd>★</kbd></button><button onClick={() => action(() => void onPerform('Moved', () => window.tempVault.moveOut([item.id])))}><span>Remove from TempVault…</span><kbd>→</kbd></button><button className="danger" onClick={() => action(() => { if (window.confirm(`Send ${item.name} to the Recycle Bin?`)) void onPerform('Recycled', () => window.tempVault.trash([item.id])) })}><span>Move to Recycle Bin</span><kbd>⌫</kbd></button></div>
}

function PreviewRail({ order, previews, onOrder, onFloat, onRemove }: { order: string[]; previews: Record<string, FilePreview>; onOrder(ids: string[]): void; onFloat(id: string): void; onRemove(id: string): void }): React.JSX.Element {
  const [dragged, setDragged] = useState<string | null>(null)
  if (!order.length) return <div className="rail-empty"><div>PV</div><b>SELECT FILES TO PREVIEW</b><p>Choose one or many file records. Drag a preview card into the workspace to detach it.</p></div>
  return <div className="preview-grid">{order.map((id) => <article className="preview-widget" key={id} draggable onDragStart={(event) => { setDragged(id); event.dataTransfer.setData('application/x-tempvault-preview', id); event.dataTransfer.effectAllowed = 'copyMove' }} onDragEnd={() => setDragged(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const source = dragged ?? event.dataTransfer.getData('application/x-tempvault-preview'); if (!source || source === id) return; const next = order.filter((value) => value !== source); next.splice(next.indexOf(id), 0, source); onOrder(next) }}><header><span>::</span><strong>{previews[id]?.item.name ?? 'Loading…'}</strong><button title="Detach inside app" onClick={() => onFloat(id)}>↗</button><button title="Close preview" onClick={() => onRemove(id)}>×</button></header><PreviewContent preview={previews[id]} compact /></article>)}</div>
}

function PreviewContent({ preview, compact = false }: { preview?: FilePreview; compact?: boolean }): React.JSX.Element {
  if (!preview) return <div className="preview-loading">LOADING PREVIEW…</div>
  if (preview.kind === 'image') return <div className="visual-preview"><img src={preview.dataUrl} alt={preview.item.name} /></div>
  if (preview.kind === 'audio') return <div className="media-preview"><div className="file-monogram">AU</div><audio controls src={preview.dataUrl} /></div>
  if (preview.kind === 'video') return <div className="visual-preview"><video controls src={preview.dataUrl} /></div>
  if (preview.kind === 'pdf') return compact ? <div className="media-preview"><div className="file-monogram">PDF</div><p>Detach to inspect this PDF.</p></div> : <iframe className="pdf-preview" src={preview.dataUrl} title={preview.item.name} />
  if (preview.kind === 'text' || preview.kind === 'folder') return <pre className="text-preview">{preview.content || 'Empty file'}{preview.truncated ? '\n\n[PREVIEW TRUNCATED]' : ''}</pre>
  return <div className="media-preview"><div className="file-monogram">{preview.item.extension?.toUpperCase() || 'FILE'}</div><p>{preview.message}</p><button onClick={() => void window.tempVault.openItem(preview.item.id)}>OPEN WITH DEFAULT APP</button></div>
}

function FloatingPreview({ state, preview, onClose, onFocus, onUpdate }: { state: FloatingWindow; preview?: FilePreview; onClose(): void; onFocus(): void; onUpdate(patch: Partial<FloatingWindow>): void }): React.JSX.Element {
  function startMove(event: React.PointerEvent): void {
    event.preventDefault(); onFocus(); const startX = event.clientX; const startY = event.clientY; const originX = state.x; const originY = state.y
    const move = (next: PointerEvent): void => onUpdate({ x: Math.max(0, originX + next.clientX - startX), y: Math.max(44, originY + next.clientY - startY) })
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  function startResize(event: React.PointerEvent): void {
    event.preventDefault(); event.stopPropagation(); const startX = event.clientX; const startY = event.clientY; const width = state.width; const height = state.height
    const move = (next: PointerEvent): void => onUpdate({ width: Math.max(280, width + next.clientX - startX), height: Math.max(220, height + next.clientY - startY) })
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return <section className="floating-preview" style={{ left: state.x, top: state.y, width: state.width, height: state.height, zIndex: state.z }} onPointerDown={onFocus}><header onPointerDown={startMove}><span>::</span><strong>{preview?.item.name ?? 'Preview'}</strong><button onPointerDown={(event) => event.stopPropagation()} onClick={() => preview && void window.tempVault.revealItem(preview.item.id)}>•••</button><button onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button></header><div className="floating-content"><PreviewContent preview={preview} /></div><i className="resize-handle" onPointerDown={startResize} /></section>
}

function AgentPanel({ selectedIds, settings, onSettings }: { selectedIds: string[]; settings: VaultSnapshot['settings']; onSettings(): void }): React.JSX.Element {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thinking, setThinking] = useState(false)
  useEffect(() => { void window.tempVault.getAgentStatus().then(setStatus) }, [settings.agentModel])
  async function ask(): Promise<void> {
    const value = question.trim(); if (!value || thinking) return
    setMessages((current) => [...current, { role: 'user', content: value }]); setQuestion(''); setThinking(true)
    try { const answer = await window.tempVault.askAgent(value, selectedIds); setMessages((current) => [...current, { role: 'assistant', content: answer.answer, answer }]) } catch (error) { setMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : String(error) }]) } finally { setThinking(false) }
  }
  return <div className="agent-panel"><div className="agent-status"><div><i className={status?.available ? 'online' : ''} /><span>{status?.message ?? 'Checking local runtime…'}</span></div><button onClick={onSettings}>CONFIGURE</button></div><div className="agent-intro"><b>FILE AGENT</b><p>Answers from your local vault using <strong>{settings.agentModel}</strong>. File data is sent only to Ollama at 127.0.0.1.</p><span>{selectedIds.length ? `${selectedIds.length} selected files prioritized · all vault files available` : 'All vault files available as context'}</span></div><div className="chat-log">{messages.map((message, index) => <div key={index} className={`message ${message.role}`}><small>{message.role === 'user' ? 'YOU' : 'LOCAL AGENT'}</small><p>{message.content}</p>{message.answer && <span>{message.answer.sources.length} files supplied · {message.answer.model}</span>}</div>)}{thinking && <div className="message assistant"><small>LOCAL AGENT</small><p className="thinking">READING FILES…</p></div>}</div><div className="composer"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} placeholder="Ask anything about your files…" /><div><span>ENTER TO SEND · LOCAL ONLY</span><button disabled={!question.trim() || thinking} onClick={() => void ask()}>↑</button></div></div></div>
}

function Dock({ onAdd, onInbox, onPreview, onAgent, onRefresh, onSettings, active }: { onAdd(): void; onInbox(): void; onPreview(): void; onAgent(): void; onRefresh(): void; onSettings(): void; active: Panel }): React.JSX.Element {
  const actions = [
    { glyph: '+', label: 'Add files', action: onAdd }, { glyph: 'IN', label: 'Inbox', action: onInbox },
    { glyph: 'PV', label: 'Previews', action: onPreview, active: active === 'preview' }, { glyph: 'AI', label: 'Local agent', action: onAgent, active: active === 'agent' },
    { glyph: '↻', label: 'Refresh', action: onRefresh }, { glyph: '⚙', label: 'Appearance', action: onSettings }
  ]
  return <nav className="app-dock" aria-label="Quick actions">{actions.map((item) => <button key={item.label} className={item.active ? 'active' : ''} onClick={item.action}><span>{item.glyph}</span><i>{item.label}</i></button>)}</nav>
}

function Settings({ snapshot, onClose, onSaved }: { snapshot: VaultSnapshot; onClose(): void; onSaved(): Promise<void> }): React.JSX.Element {
  const [days, setDays] = useState(snapshot.settings.staleDays); const [startup, setStartup] = useState(snapshot.settings.launchAtStartup); const [theme, setTheme] = useState(snapshot.settings.theme); const [model, setModel] = useState(snapshot.settings.agentModel); const [accent, setAccent] = useState(snapshot.settings.accentColor); const [background, setBackground] = useState(snapshot.settings.backgroundColor); const [opacity, setOpacity] = useState(snapshot.settings.windowOpacity); const [saving, setSaving] = useState(false)
  const accents = ['#ffffff', '#60a5fa', '#22d3ee', '#4ade80', '#ffd43b', '#ff5c5c', '#f472b6', '#a78bfa']
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal"><header><div><p>CONFIGURATION</p><h2>SETTINGS</h2></div><button onClick={onClose}>×</button></header><div className="settings-scroll"><Setting label="REVIEW AGE" hint="Mark temporary files for review after this many days."><label><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /> DAYS</label></Setting><Setting label="APPEARANCE" hint="Switch the interface contrast mode."><div className="segmented"><button className={theme === 'dark' ? 'active' : ''} onClick={() => { setTheme('dark'); setBackground('#000000') }}>BLACK</button><button className={theme === 'light' ? 'active' : ''} onClick={() => { setTheme('light'); setBackground('#ffffff') }}>WHITE</button></div></Setting><Setting label="ACCENT COLOR" hint="Used for focus, selection and active previews."><div className="color-choices">{accents.map((color) => <button key={color} className={accent === color ? 'active' : ''} style={{ background: color }} onClick={() => setAccent(color)} aria-label={`Accent ${color}`} />)}<input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></div></Setting><Setting label="BACKGROUND" hint="Choose the base window color."><label className="color-input"><input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /><code>{background.toUpperCase()}</code></label></Setting><Setting label="WINDOW OPACITY" hint="Adjust the translucency of the entire window."><label className="range-input"><input type="range" min="65" max="100" value={Math.round(opacity * 100)} onChange={(event) => setOpacity(Number(event.target.value) / 100)} /><b>{Math.round(opacity * 100)}%</b></label></Setting><Setting label="LOCAL AI MODEL" hint="Exact Ollama model name. Recommended custom name: tempvault-agent."><input className="model-input" value={model} onChange={(event) => setModel(event.target.value)} /></Setting><Setting label="LAUNCH AT STARTUP" hint="Open TempVault when you sign in."><label className="switch"><input type="checkbox" checked={startup} onChange={(event) => setStartup(event.target.checked)} /><i /></label></Setting><div className="location-setting"><span>STORAGE LOCATION</span><code>{snapshot.settings.storageRoot}</code></div></div><footer><button onClick={onClose}>CANCEL</button><button className="solid" disabled={saving} onClick={async () => { setSaving(true); await window.tempVault.updateSettings({ staleDays: Math.max(1, Math.min(365, days)), launchAtStartup: startup, theme, agentModel: model, accentColor: accent, backgroundColor: background, windowOpacity: opacity }); await onSaved() }}>SAVE</button></footer></section></div>
}
function Setting({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }): React.JSX.Element { return <div className="setting-row"><div><strong>{label}</strong><p>{hint}</p></div>{children}</div> }

function viewTitle(view: View): string { return ({ all: 'FILE RECORDS', temporary: 'TEMPORARY', kept: 'KEPT FILES', stale: 'NEEDS REVIEW' })[view] }
function formatBytes(bytes: number): string { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}` }
function relativeDate(timestamp: number): string { const days = Math.floor((Date.now() - timestamp) / 86_400_000); if (days <= 0) return 'TODAY'; if (days === 1) return 'YESTERDAY'; if (days < 30) return `${days}D AGO`; return new Date(timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() }
function shortPath(path: string): string { const parts = path.split(/[\\/]/); return parts.slice(-3, -1).join(' / ').toUpperCase() }
