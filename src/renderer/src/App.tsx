import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, type AgentAnswer, type AgentStatus, type Category, type FilePreview, type OperationResult, type VaultItem, type VaultSnapshot } from '../../shared/types'

type View = 'all' | 'temporary' | 'kept' | 'stale' | 'folders'
type SortKey = 'name' | 'category' | 'size' | 'modifiedAt'
type Panel = 'preview' | 'agent'
type FloatingWindow = { key: string; id: string; x: number; y: number; width: number; height: number; z: number }
type ChatMessage = { role: 'user' | 'assistant'; content: string; answer?: AgentAnswer }
type ContextState = { id: string; x: number; y: number } | null
type RailSize = { width: number; height: number }
type RailResizeAxis = 'width' | 'height' | 'both'
type PreviewWidgetSize = { span: number; height: number }

const icons: Record<string, string> = { Images: 'IM', Videos: 'VI', Audio: 'AU', Documents: 'DO', Spreadsheets: 'SP', Presentations: 'PR', Archives: 'AR', Installers: 'IN', Code: 'CO', Fonts: 'FO', Folders: 'DI', Other: 'FI' }

function beginFileDrag(event: React.DragEvent<HTMLElement>, id: string): void {
  event.dataTransfer.setData('application/x-tempvault-file', id)
  event.dataTransfer.effectAllowed = 'move'
  const transparent = document.createElement('canvas'); transparent.width = 1; transparent.height = 1
  event.dataTransfer.setDragImage(transparent, 0, 0)
  event.currentTarget.classList.add('dragging')
}

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
  const [quickPreviewId, setQuickPreviewId] = useState<string | null>(null)
  const [floating, setFloating] = useState<FloatingWindow[]>([])
  const [panel, setPanel] = useState<Panel>('preview')
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextState>(null)
  const [railSize, setRailSize] = useState<RailSize>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tempvault:preview-rail-size') ?? '') as Partial<RailSize>
      return { width: Number(saved.width) || Math.min(390, Math.max(320, window.innerWidth * .28)), height: Number(saved.height) || window.innerHeight - 60 }
    } catch { return { width: Math.min(390, Math.max(320, window.innerWidth * .28)), height: window.innerHeight - 60 } }
  })
  const workspaceRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const next = await window.tempVault.getSnapshot()
    document.documentElement.dataset.theme = next.settings.theme
    document.documentElement.style.setProperty('--accent', next.settings.accentColor)
    document.documentElement.style.setProperty('--bg', next.settings.backgroundColor)
    document.documentElement.style.setProperty('--bg-gradient', next.settings.gradientColor)
    document.documentElement.style.setProperty('--secondary', next.settings.secondaryColor)
    document.documentElement.style.setProperty('--app-background', next.settings.gradientEnabled ? `linear-gradient(135deg, ${next.settings.backgroundColor}, ${next.settings.gradientColor})` : next.settings.backgroundColor)
    document.documentElement.style.setProperty('--sidebar-alpha', String(next.settings.windowOpacity))
    setSnapshot(next)
    setSelected((current) => new Set([...current].filter((id) => next.items.some((item) => item.id === id))))
    setPreviewOrder((current) => current.filter((id) => next.items.some((item) => item.id === id)))
    setQuickPreviewId((current) => next.settings.autoPreview && current && next.items.some((item) => item.id === current) ? current : null)
  }, [])

  useEffect(() => { void refresh(); return window.tempVault.onVaultChanged(() => void refresh()) }, [refresh])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3_500); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => {
    for (const id of [...previewOrder, ...(quickPreviewId ? [quickPreviewId] : [])]) if (!previews[id]) void window.tempVault.getPreview(id).then((preview) => setPreviews((current) => ({ ...current, [id]: preview }))).catch((error) => setToast(error instanceof Error ? error.message : String(error)))
  }, [previewOrder, quickPreviewId, previews])
  useEffect(() => { const close = (): void => setContextMenu(null); window.addEventListener('pointerdown', close); window.addEventListener('blur', close); return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close) } }, [])
  useEffect(() => { localStorage.setItem('tempvault:preview-rail-size', JSON.stringify(railSize)) }, [railSize])
  useEffect(() => {
    const clamp = (): void => setRailSize((current) => ({ width: Math.max(310, Math.min(current.width, window.innerWidth - 760)), height: Math.max(320, Math.min(current.height, window.innerHeight - 60)) }))
    window.addEventListener('resize', clamp); return () => window.removeEventListener('resize', clamp)
  }, [])

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
  function showAutomaticPreview(id: string | null): void { if (snapshot?.settings.autoPreview) setQuickPreviewId(id) }
  function toggleItem(id: string): void { const removing = selected.has(id); setPanel('preview'); if (!removing) showAutomaticPreview(id); else if (quickPreviewId === id) showAutomaticPreview(null); setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next }) }
  function selectRow(event: React.MouseEvent, id: string): void {
    setPanel('preview')
    if (event.ctrlKey || event.metaKey) toggleItem(id)
    else { const clearing = selected.size === 1 && selected.has(id); showAutomaticPreview(clearing ? null : id); setSelected(clearing ? new Set() : new Set([id])) }
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
    setPreviewOrder((current) => current.filter((value) => value !== id))
  }

  function updateFloating(key: string, patch: Partial<FloatingWindow>): void { setFloating((current) => current.map((window) => window.key === key ? { ...window, ...patch } : window)) }
  function focusFloating(key: string): void { const z = Math.max(0, ...floating.map((window) => window.z)) + 1; updateFloating(key, { z }) }

  async function trashSelected(): Promise<void> {
    if (selected.size && window.confirm(`Send ${selected.size} selected item${selected.size === 1 ? '' : 's'} to the Recycle Bin?`)) await perform('Recycled', () => window.tempVault.trash([...selected]))
  }

  async function changeZoom(action: 'in' | 'out' | 'reset'): Promise<void> {
    const factor = await (action === 'in' ? window.tempVault.zoomIn() : action === 'out' ? window.tempVault.zoomOut() : window.tempVault.zoomReset())
    setToast(`Zoom ${Math.round(factor * 100)}%`)
  }

  function startRailResize(event: React.PointerEvent, axis: RailResizeAxis): void {
    event.preventDefault(); event.stopPropagation()
    const startX = event.clientX; const startY = event.clientY; const origin = railSize
    document.body.classList.add('rail-is-resizing')
    const move = (next: PointerEvent): void => setRailSize({
      width: axis === 'height' ? origin.width : Math.max(310, Math.min(window.innerWidth - 760, origin.width - (next.clientX - startX))),
      height: axis === 'width' ? origin.height : Math.max(320, Math.min(window.innerHeight - 60, origin.height + (next.clientY - startY)))
    })
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('rail-is-resizing') }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function resizeRailWithKeyboard(event: React.KeyboardEvent, axis: RailResizeAxis): void {
    const amount = event.shiftKey ? 40 : 12
    const horizontal = event.key === 'ArrowLeft' ? amount : event.key === 'ArrowRight' ? -amount : 0
    const vertical = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0
    if ((!horizontal || axis === 'height') && (!vertical || axis === 'width')) return
    event.preventDefault()
    setRailSize((current) => ({ width: Math.max(310, Math.min(window.innerWidth - 760, current.width + horizontal)), height: Math.max(320, Math.min(window.innerHeight - 60, current.height + vertical)) }))
  }

  if (!snapshot) return <div className="loading"><div className="vault-mark">TV</div><span>OPENING VAULT</span></div>
  const selectedItems = snapshot.items.filter((item) => selected.has(item.id))

  return (
    <div className="app-shell" style={{ '--rail-width': `${railSize.width}px`, '--rail-height': `${railSize.height}px` } as React.CSSProperties} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDraggingFiles(true) } }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFiles(false) }} onDrop={(event) => { if (event.dataTransfer.files.length) void handleFileDrop(event) }}>
      <header className="titlebar"><div className="brand"><span className="vault-mark small">TV</span><span>TEMPVAULT</span><em>LOCAL ONLY</em></div><div className="title-actions"><button title="Ask the local agent" onClick={() => setPanel('agent')}>AI</button><button title="Toggle light mode" onClick={() => { const theme = snapshot.settings.theme === 'dark' ? 'light' : 'dark'; void window.tempVault.updateSettings({ theme, backgroundColor: theme === 'light' ? '#ffffff' : '#000000' }).then(refresh) }}>{snapshot.settings.theme === 'dark' ? '☼' : '◐'}</button></div></header>
      <aside className="sidebar">
        <div className="nav-section"><span>LIBRARY</span><Nav active={view === 'all'} label="All files" count={snapshot.items.length} glyph="01" onClick={() => setView('all')} /><Nav active={view === 'temporary'} label="Temporary" count={snapshot.totals.temporary} glyph="02" onClick={() => setView('temporary')} /><Nav active={view === 'kept'} label="Kept" count={snapshot.totals.kept} glyph="03" onClick={() => setView('kept')} /><Nav active={view === 'stale'} label="Review" count={snapshot.totals.stale} glyph="04" onClick={() => setView('stale')} /><Nav active={view === 'folders'} label="Type folders" count={buildFolderGroups(snapshot.items).length} glyph="05" onClick={() => setView('folders')} /></div>
        <div className="nav-section"><span>TOOLS</span><button className={`nav-item ${panel === 'preview' ? 'active' : ''}`} onClick={() => setPanel('preview')}><i>PV</i><b>Previews</b><small>{previewOrder.length}</small></button><button className={`nav-item ${panel === 'agent' ? 'active' : ''}`} onClick={() => setPanel('agent')}><i>AI</i><b>File agent</b><small>LOCAL</small></button><button className="nav-item" onClick={() => void window.tempVault.openInbox()}><i>IN</i><b>Watched inbox</b></button></div>
        <div className="storage-block"><div><span>STORAGE</span><strong>{formatBytes(snapshot.totals.bytes)}</strong></div><p title={snapshot.settings.storageRoot}>{snapshot.settings.storageRoot}</p></div>
        <button className="settings-link" onClick={() => setSettingsOpen(true)}>SETTINGS <span>→</span></button>
      </aside>

      <main className="workspace" ref={workspaceRef} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-tempvault-preview')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }} onDrop={handleWorkspaceDrop}>
        {view === 'folders' ? <FolderLibrary items={snapshot.items} onPreview={openPreview} onContext={(event, id) => { event.preventDefault(); setContextMenu({ id, x: event.clientX, y: event.clientY }) }} /> : <>
        <section className="workspace-head"><div><p className="kicker">FILES / {view.toUpperCase()}</p><h1>{viewTitle(view)}</h1><p>{snapshot.items.length} records · {formatBytes(snapshot.totals.bytes)} on disk</p></div><div className="head-actions"><button onClick={() => void perform('Added', () => window.tempVault.addFolder())}>NEW FOLDER IMPORT</button><button className="solid" onClick={() => void perform('Added', () => window.tempVault.addFiles())}>＋ ADD FILES</button></div></section>
        <section className="metrics"><Metric label="TOTAL" value={snapshot.items.length} /><Metric label="TEMPORARY" value={snapshot.totals.temporary} /><Metric label="KEPT" value={snapshot.totals.kept} /><Metric label="REVIEW" value={snapshot.totals.stale} /></section>
        <section className="records">
          <div className="record-tools"><label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" /></label><ColorFilter value={category} hovered={hoverCategory} items={snapshot.items} onHover={setHoverCategory} onChange={setCategory} /><button onClick={() => void refresh()}>REFRESH</button></div>
          <div className={`bulk-slot ${selected.size ? 'visible' : ''}`} aria-hidden={!selected.size}><div className="bulk"><strong>{selected.size} SELECTED</strong><span>The latest selection appears in quick preview.</span><div><button disabled={busy} onClick={() => void perform('Kept', () => window.tempVault.keep([...selected]))}>KEEP</button><button disabled={busy} onClick={() => void perform('Temporary', () => window.tempVault.restore([...selected]))}>TEMPORARY</button><button disabled={busy} onClick={() => void perform('Moved', () => window.tempVault.moveOut([...selected]))}>MOVE OUT</button><button className="danger" disabled={busy} onClick={() => void trashSelected()}>RECYCLE</button><button onClick={() => { setSelected(new Set()); setQuickPreviewId(null) }}>×</button></div></div></div>
          <div className="record-header"><div><input type="checkbox" checked={items.length > 0 && items.every((item) => selected.has(item.id))} onChange={() => { setPanel('preview'); setSelected(items.every((item) => selected.has(item.id)) ? new Set() : new Set(items.map((item) => item.id))) }} /></div><SortButton label="FILE RECORD" column="name" sort={sort} onClick={toggleSort} /><SortButton label="TYPE" column="category" sort={sort} onClick={toggleSort} /><span>STATE</span><SortButton label="SIZE" column="size" sort={sort} onClick={toggleSort} /><SortButton label="UPDATED" column="modifiedAt" sort={sort} onClick={toggleSort} /><span /></div>
          {pagedItems.map((item) => <FileRecord key={item.id} item={item} active={selected.has(item.id)} stale={item.status === 'temporary' && item.modifiedAt < staleBoundary} onToggle={toggleItem} onSelect={selectRow} onPreview={() => openPreview(item.id)} onContext={(event) => { event.preventDefault(); setContextMenu({ id: item.id, x: event.clientX, y: event.clientY }) }} />)}
          {!items.length && <div className="empty"><b>NO FILE RECORDS</b><p>{search || category !== 'all' ? 'Adjust the search or filter.' : 'Drop files anywhere or add your first record.'}</p></div>}
          {!!items.length && <Pagination page={page} count={pageCount} total={items.length} onChange={setPage} />}
        </section>
        </>}
        {floating.map((windowState) => <FloatingPreview key={windowState.key} state={windowState} preview={previews[windowState.id]} onClose={() => setFloating((current) => current.filter((item) => item.key !== windowState.key))} onFocus={() => focusFloating(windowState.key)} onUpdate={(patch) => updateFloating(windowState.key, patch)} />)}
      </main>

      <aside className="right-rail" onDragStart={(event) => { if (!event.dataTransfer.types.includes('application/x-tempvault-file')) event.preventDefault() }} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-tempvault-file')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('drop-ready') } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.classList.remove('drop-ready') }} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('drop-ready'); const id = event.dataTransfer.getData('application/x-tempvault-file'); if (id) openPreview(id) }}>
        <div className="rail-resizer rail-resizer-width" role="separator" aria-label="Resize preview panel width" aria-orientation="vertical" tabIndex={0} onPointerDown={(event) => startRailResize(event, 'width')} onKeyDown={(event) => resizeRailWithKeyboard(event, 'width')} />
        <div className="rail-resizer rail-resizer-height" role="separator" aria-label="Resize preview panel height" aria-orientation="horizontal" tabIndex={0} onPointerDown={(event) => startRailResize(event, 'height')} onKeyDown={(event) => resizeRailWithKeyboard(event, 'height')} />
        <div className="rail-resizer rail-resizer-corner" role="separator" aria-label="Resize preview panel" tabIndex={0} onPointerDown={(event) => startRailResize(event, 'both')} onKeyDown={(event) => resizeRailWithKeyboard(event, 'both')} />
        <div className="rail-tabs"><button className={panel === 'preview' ? 'active' : ''} onClick={() => setPanel('preview')}>PREVIEW <span>{previewOrder.length}</span></button><button className={panel === 'agent' ? 'active' : ''} onClick={() => setPanel('agent')}>ASK AI</button></div>
        {panel === 'preview' ? <PreviewRail order={previewOrder} previews={previews} quickPreviewId={quickPreviewId} onCloseQuick={() => setQuickPreviewId(null)} onReorder={setPreviewOrder} onFloat={createFloating} onMove={(id, x, y) => { createFloating(id, x, y); setPreviewOrder((current) => current.filter((value) => value !== id)) }} onRemove={(id) => setPreviewOrder((current) => current.filter((value) => value !== id))} /> : <AgentPanel selectedIds={[...selected]} settings={snapshot.settings} onSettings={() => setSettingsOpen(true)} />}
      </aside>
      <Dock onAdd={() => void perform('Added', () => window.tempVault.addFiles())} onInbox={() => void window.tempVault.openInbox()} onPreview={() => setPanel('preview')} onAgent={() => setPanel('agent')} onZoomIn={() => void changeZoom('in')} onZoomOut={() => void changeZoom('out')} onRefresh={() => void refresh()} onSettings={() => setSettingsOpen(true)} active={panel} />
      {contextMenu && <ContextMenu item={snapshot.items.find((item) => item.id === contextMenu.id)} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onPreview={() => openPreview(contextMenu.id)} onFloat={() => { openPreview(contextMenu.id); createFloating(contextMenu.id) }} onPerform={perform} />}
      {draggingFiles && <div className="file-drop"><div><b>MOVE INTO TEMPVAULT</b><span>The originals leave their current folder. Mark files as Keep to protect them in the vault.</span></div></div>}
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

type FolderGroup = { key: string; label: string; description: string; color: string; items: VaultItem[] }

const folderDefinitions: Array<Omit<FolderGroup, 'items'>> = [
  { key: 'pdf', label: 'PDFs', description: 'PDF documents', color: '#ef4444' },
  { key: 'word', label: 'Word & text', description: 'Documents and notes', color: '#3b82f6' },
  { key: 'sheets', label: 'Spreadsheets', description: 'Tables and data', color: '#22c55e' },
  { key: 'slides', label: 'Presentations', description: 'Slides and decks', color: '#f97316' },
  { key: 'images', label: 'Images', description: 'Pictures and graphics', color: '#a855f7' },
  { key: 'video', label: 'Videos', description: 'Video media', color: '#06b6d4' },
  { key: 'audio', label: 'Audio', description: 'Music and recordings', color: '#ec4899' },
  { key: 'archives', label: 'Archives', description: 'Compressed packages', color: '#f59e0b' },
  { key: 'code', label: 'Code', description: 'Source and project files', color: '#60a5fa' },
  { key: 'installers', label: 'Installers', description: 'Applications and setup files', color: '#fb7185' },
  { key: 'fonts', label: 'Fonts', description: 'Typeface files', color: '#c084fc' },
  { key: 'directories', label: 'Folders', description: 'Imported directories', color: '#eab308' },
  { key: 'other', label: 'Other', description: 'Everything else', color: '#94a3b8' }
]

function folderKeyFor(item: VaultItem): string {
  const extension = item.extension.toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(extension)) return 'word'
  if (['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(extension)) return 'sheets'
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'slides'
  return ({ Images: 'images', Videos: 'video', Audio: 'audio', Archives: 'archives', Code: 'code', Installers: 'installers', Fonts: 'fonts', Folders: 'directories' } as Partial<Record<Category, string>>)[item.category] ?? 'other'
}

function buildFolderGroups(items: VaultItem[]): FolderGroup[] {
  return folderDefinitions.map((definition) => ({ ...definition, items: items.filter((item) => folderKeyFor(item) === definition.key).sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name)) })).filter((group) => group.items.length)
}

function FolderLibrary({ items, onPreview, onContext }: { items: VaultItem[]; onPreview(id: string): void; onContext(event: React.MouseEvent, id: string): void }): React.JSX.Element {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const groups = buildFolderGroups(items).map((group) => ({ ...group, items: group.items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())) })).filter((group) => group.items.length)
  const tilt = (event: React.PointerEvent<HTMLElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--folder-rx', `${((event.clientY - bounds.top) / bounds.height - .5) * -5}deg`)
    event.currentTarget.style.setProperty('--folder-ry', `${((event.clientX - bounds.left) / bounds.width - .5) * 7}deg`)
  }
  const resetTilt = (event: React.PointerEvent<HTMLElement>): void => { event.currentTarget.style.removeProperty('--folder-rx'); event.currentTarget.style.removeProperty('--folder-ry') }
  const toggleFolder = (key: string): void => { const update = (): void => setOpenKey((current) => current === key ? null : key); const transition = (document as Document & { startViewTransition?: (callback: () => void) => void }).startViewTransition; transition ? transition.call(document, update) : update() }
  return <section className="folder-library"><header className="folder-library-head"><div><p className="kicker">FILES / TYPE FOLDERS</p><h1>TYPE FOLDERS</h1><p>{groups.length} folders · {items.length} files sorted automatically</p></div><label><UiIcon name="folder" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search these folders" /></label></header><div className="folder-card-grid">{groups.map((group, index) => { const open = openKey === group.key; return <article className={`glass-folder-card ${open ? 'open' : ''}`} style={{ '--folder-color': group.color, '--folder-delay': `${index * 35}ms`, viewTransitionName: `folder-${index}` } as React.CSSProperties} onPointerMove={tilt} onPointerLeave={resetTilt} key={group.key}><button className="folder-cover" aria-expanded={open} onClick={() => toggleFolder(group.key)}><span className="folder-tab" /><span className="folder-sheets" aria-hidden="true">{group.items.slice(0, 3).map((item, sheetIndex) => <i style={{ '--sheet-index': sheetIndex } as React.CSSProperties} key={item.id}><FileIcon item={item} /></i>)}</span><span className="folder-glass"><span><UiIcon name="folder" /></span><strong>{group.label}</strong><small>{group.description}</small><b>{group.items.length} FILE{group.items.length === 1 ? '' : 'S'}</b></span></button><div className="folder-files-reveal" aria-hidden={!open}><div className="folder-files">{group.items.map((item) => <button key={item.id} draggable onDragStart={(event) => beginFileDrag(event, item.id)} onDragEnd={(event) => event.currentTarget.classList.remove('dragging')} onClick={() => onPreview(item.id)} onDoubleClick={() => void window.tempVault.openItem(item.id)} onContextMenu={(event) => onContext(event, item.id)}><FileIcon item={item} /><span><strong>{item.name}</strong><small>{fileTypeLabel(item)} · {formatBytes(item.size)}</small></span><i>→</i></button>)}</div></div></article> })}</div>{!groups.length && <div className="folder-library-empty"><UiIcon name="folder" /><strong>NO MATCHING FILES</strong><span>Try another search or add files to TempVault.</span></div>}</section>
}

function Metric({ label, value }: { label: string; value: number }): React.JSX.Element { return <article><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></article> }
function SortButton({ label, column, sort, onClick }: { label: string; column: SortKey; sort: { key: SortKey; descending: boolean }; onClick(key: SortKey): void }): React.JSX.Element { return <button onClick={() => onClick(column)}>{label}{sort.key === column ? (sort.descending ? ' ↓' : ' ↑') : ''}</button> }

function FileRecord({ item, active, stale, onToggle, onSelect, onPreview, onContext }: { item: VaultItem; active: boolean; stale: boolean; onToggle(id: string): void; onSelect(event: React.MouseEvent, id: string): void; onPreview(): void; onContext(event: React.MouseEvent): void }): React.JSX.Element {
  const type = fileTypeLabel(item)
  return <div className={`record-row ${active ? 'active' : ''}`} draggable onDragStart={(event) => beginFileDrag(event, item.id)} onDragEnd={(event) => event.currentTarget.classList.remove('dragging')} onContextMenu={onContext} onClick={(event) => onSelect(event, item.id)} onDoubleClick={onPreview}><div onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={active} onChange={() => onToggle(item.id)} /></div><div className="record-name"><i><FileIcon item={item} /></i><div><strong title={item.name}>{item.name}</strong><small>{type.toUpperCase()} · {shortPath(item.path)}</small></div></div><span title={type}>{type.toUpperCase()}</span><span className="state-tag">{stale ? 'REVIEW' : item.status.toUpperCase()}</span><span>{formatBytes(item.size)}</span><span>{relativeDate(item.modifiedAt)}</span><button title="Preview" onClick={(event) => { event.stopPropagation(); onPreview() }}>→</button></div>
}

function ContextMenu({ item, x, y, onClose, onPreview, onFloat, onPerform }: { item?: VaultItem; x: number; y: number; onClose(): void; onPreview(): void; onFloat(): void; onPerform(label: string, task: () => Promise<OperationResult>): Promise<void> }): React.JSX.Element | null {
  if (!item) return null
  const left = Math.min(x, window.innerWidth - 230); const top = Math.min(y, window.innerHeight - 330)
  const action = (task: () => void): void => { onClose(); task() }
  return <div className="context-menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}><header><i><FileIcon item={item} /></i><div><strong>{item.name}</strong><span>{fileTypeLabel(item)} · {formatBytes(item.size)}</span></div></header><button onClick={() => action(onPreview)}><span>Open in preview rail</span><kbd>↵</kbd></button><button onClick={() => action(onFloat)}><span>Open floating preview</span><kbd>↗</kbd></button><hr /><button onClick={() => action(() => void window.tempVault.openItem(item.id))}><span>Open with default app</span><kbd>↥</kbd></button><button onClick={() => action(() => void window.tempVault.revealItem(item.id))}><span>Show in File Explorer</span><kbd>⌕</kbd></button><hr /><button onClick={() => action(() => void onPerform(item.status === 'kept' ? 'Temporary' : 'Kept', () => item.status === 'kept' ? window.tempVault.restore([item.id]) : window.tempVault.keep([item.id])))}><span>{item.status === 'kept' ? 'Make temporary' : 'Keep this file'}</span><kbd>★</kbd></button><button onClick={() => action(() => void onPerform('Moved', () => window.tempVault.moveOut([item.id])))}><span>Remove from TempVault…</span><kbd>→</kbd></button><button className="danger" onClick={() => action(() => { if (window.confirm(`Send ${item.name} to the Recycle Bin?`)) void onPerform('Recycled', () => window.tempVault.trash([item.id])) })}><span>Move to Recycle Bin</span><kbd>⌫</kbd></button></div>
}

function PreviewRail({ order, previews, quickPreviewId, onCloseQuick, onReorder, onFloat, onMove, onRemove }: { order: string[]; previews: Record<string, FilePreview>; quickPreviewId: string | null; onCloseQuick(): void; onReorder(order: string[]): void; onFloat(id: string): void; onMove(id: string, x: number, y: number): void; onRemove(id: string): void }): React.JSX.Element {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [sizes, setSizes] = useState<Record<string, PreviewWidgetSize>>(() => {
    try { return JSON.parse(localStorage.getItem('tempvault:preview-widget-sizes') ?? '{}') as Record<string, PreviewWidgetSize> } catch { return {} }
  })
  const surfaceRef = useRef<HTMLDivElement>(null)
  const orderRef = useRef(order)
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { localStorage.setItem('tempvault:preview-widget-sizes', JSON.stringify(sizes)) }, [sizes])

  function sizeFor(id: string): PreviewWidgetSize { const saved = sizes[id]; return { span: Math.max(4, Math.min(12, saved?.span || 6)), height: Math.max(180, Math.min(520, saved?.height || 250)) } }

  function startWidgetResize(event: React.PointerEvent<HTMLButtonElement>, id: string): void {
    event.preventDefault(); event.stopPropagation(); setResizingId(id)
    const startX = event.clientX; const startY = event.clientY; const origin = sizeFor(id); const gridWidth = surfaceRef.current?.clientWidth || 360
    const move = (next: PointerEvent): void => {
      const desiredWidth = (gridWidth * origin.span / 12) + next.clientX - startX
      const span = Math.max(4, Math.min(12, Math.round(desiredWidth / gridWidth * 12)))
      const height = Math.max(180, Math.min(520, origin.height + next.clientY - startY))
      setSizes((current) => ({ ...current, [id]: { span, height: Math.round(height) } }))
    }
    const up = (): void => { setResizingId(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  function animateLayout(previous: Map<string, DOMRect>): void {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      surfaceRef.current?.querySelectorAll<HTMLElement>('.preview-grid-slot').forEach((slot) => {
        const before = previous.get(slot.dataset.previewId ?? '')
        if (!before) return
        const after = slot.getBoundingClientRect(); const x = before.left - after.left; const y = before.top - after.top
        if (Math.abs(x) > 1 || Math.abs(y) > 1) slot.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
      })
    }))
  }

  function reorder(movedId: string, overId: string): void {
    const current = orderRef.current; const from = current.indexOf(movedId); const to = current.indexOf(overId)
    if (from < 0 || to < 0 || from === to) return
    const previous = new Map<string, DOMRect>()
    surfaceRef.current?.querySelectorAll<HTMLElement>('.preview-grid-slot').forEach((slot) => previous.set(slot.dataset.previewId ?? '', slot.getBoundingClientRect()))
    const next = [...current]; next.splice(from, 1); next.splice(to, 0, movedId); orderRef.current = next; onReorder(next); animateLayout(previous)
  }

  function moveWithKeyboard(event: React.KeyboardEvent, id: string): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowRight') return
    event.preventDefault(); const index = orderRef.current.indexOf(id); const delta = event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : event.key === 'ArrowLeft' ? -1 : 1
    const target = orderRef.current[Math.max(0, Math.min(orderRef.current.length - 1, index + delta))]
    if (target) reorder(id, target)
  }

  function startInteractiveMove(event: React.PointerEvent<HTMLButtonElement>, id: string): void {
    event.preventDefault(); event.stopPropagation()
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Synthetic input and older runtimes may not expose an active pointer. */ }
    const card = event.currentTarget.closest<HTMLElement>('.preview-widget'); if (!card) return
    const bounds = card.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY
    let active = false; let lastTarget = id
    const move = (next: PointerEvent): void => {
      const dx = next.clientX - startX; const dy = next.clientY - startY
      if (!active && Math.hypot(dx, dy) < 4) return
      if (!active) {
        active = true; setDraggingId(id); card.classList.add('drag-lifted'); document.body.classList.add('preview-is-dragging')
        card.style.setProperty('--drag-left', `${bounds.left}px`); card.style.setProperty('--drag-top', `${bounds.top}px`)
        card.style.setProperty('--drag-width', `${bounds.width}px`); card.style.setProperty('--drag-height', `${bounds.height}px`)
      }
      card.style.setProperty('--drag-x', `${dx}px`); card.style.setProperty('--drag-y', `${dy}px`)
      const surface = surfaceRef.current; const rail = surface?.getBoundingClientRect()
      if (!surface || !rail || next.clientX < rail.left || next.clientX > rail.right || next.clientY < rail.top || next.clientY > rail.bottom) { setTargetId(null); return }
      const edge = 54
      if (next.clientY < rail.top + edge) surface.scrollTop -= Math.max(7, Math.ceil((rail.top + edge - next.clientY) / 3))
      else if (next.clientY > rail.bottom - edge) surface.scrollTop += Math.max(7, Math.ceil((next.clientY - (rail.bottom - edge)) / 3))
      const slots = [...surface.querySelectorAll<HTMLElement>('.preview-grid-slot')].filter((slot) => slot.dataset.previewId !== id)
      const direct = slots.find((slot) => { const rect = slot.getBoundingClientRect(); return next.clientX >= rect.left && next.clientX <= rect.right && next.clientY >= rect.top && next.clientY <= rect.bottom })
      const target = direct ?? slots.reduce<HTMLElement | null>((best, slot) => {
        if (!best) return slot
        const a = best.getBoundingClientRect(); const b = slot.getBoundingClientRect()
        return Math.hypot(next.clientX - (b.left + b.width / 2), next.clientY - (b.top + b.height / 2)) < Math.hypot(next.clientX - (a.left + a.width / 2), next.clientY - (a.top + a.height / 2)) ? slot : best
      }, null)
      const overId = target?.dataset.previewId ?? null; setTargetId(overId)
      if (overId && overId !== lastTarget) { lastTarget = overId; reorder(id, overId) }
    }
    const blockNativeDrag = (nativeEvent: Event): void => nativeEvent.preventDefault()
    const up = (next: PointerEvent): void => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('dragstart', blockNativeDrag, true); window.removeEventListener('selectstart', blockNativeDrag, true)
      card.classList.remove('drag-lifted'); document.body.classList.remove('preview-is-dragging'); ['--drag-left', '--drag-top', '--drag-width', '--drag-height', '--drag-x', '--drag-y'].forEach((name) => card.style.removeProperty(name)); setDraggingId(null); setTargetId(null)
      if (!active) return
      const workspace = document.querySelector('.workspace')?.getBoundingClientRect()
      if (workspace && next.clientX >= workspace.left && next.clientX <= workspace.right && next.clientY >= workspace.top && next.clientY <= workspace.bottom) onMove(id, next.clientX, next.clientY)
    }
    const cancel = (): void => up(new PointerEvent('pointercancel', { clientX: startX, clientY: startY }))
    window.addEventListener('dragstart', blockNativeDrag, true); window.addEventListener('selectstart', blockNativeDrag, true); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel)
  }

  if (!order.length && !quickPreviewId) return <div className="rail-empty"><div><UiIcon name="preview" /></div><b>SELECT A FILE TO QUICK PREVIEW</b><p>Selection can preview automatically. Drag files here to pin them in the two-column board.</p></div>
  const quick = quickPreviewId ? previews[quickPreviewId] : undefined
  return <section className={`preview-grid-shell ${draggingId ? 'is-rearranging' : ''} ${resizingId ? 'is-resizing-widget' : ''}`} onDragStart={(event) => event.preventDefault()}>{quickPreviewId && <article className="quick-preview"><header><span><UiIcon name="preview" /></span><div><small>QUICK PREVIEW</small><strong>{quick?.item.name ?? 'Loading…'}</strong></div><button title="Pin preview" onClick={() => { if (!order.includes(quickPreviewId)) onReorder([quickPreviewId, ...order]) }}><UiIcon name="add" /></button><button title="Close quick preview" onClick={onCloseQuick}>×</button></header><div className="quick-preview-content"><PreviewContent preview={quick} compact /></div></article>} {!!order.length && <><div className="preview-grid-guide"><span><UiIcon name="grip" /> {draggingId ? 'ARRANGING PANELS' : resizingId ? 'RESIZING PANEL' : 'DRAG TO ARRANGE · CORNER TO RESIZE'}</span><small>DEFAULT: 2 PER ROW · {order.length} PINNED</small></div><div className="preview-grid" ref={surfaceRef}>{order.map((id, index) => { const name = previews[id]?.item.name ?? 'Loading…'; const size = sizeFor(id); return <div className={`preview-grid-slot ${draggingId === id ? 'drag-origin' : ''} ${targetId === id ? 'drop-target' : ''} ${resizingId === id ? 'widget-resizing' : ''}`} style={{ '--widget-span': size.span, '--widget-height': `${size.height}px` } as React.CSSProperties} data-preview-id={id} key={id}><article className={`preview-widget ${draggingId === id ? 'drag-lifted' : ''}`} draggable={false} data-preview-id={id}><header><button className="widget-drag-zone widget-grip" draggable={false} title="Drag to rearrange" aria-label={`Rearrange ${name}, item ${index + 1} of ${order.length}`} onPointerDown={(event) => startInteractiveMove(event, id)} onKeyDown={(event) => moveWithKeyboard(event, id)}><UiIcon name="grip" /><span className="preview-file-icon">{previews[id] ? <FileIcon item={previews[id].item} /> : <UiIcon name="file" />}</span><strong>{name}</strong></button><button title="Move into workspace" onClick={() => { onFloat(id); onRemove(id) }}><UiIcon name="detach" /></button><button title="Close preview" onClick={() => onRemove(id)}>×</button></header><PreviewContent preview={previews[id]} compact /><button className="widget-resize-handle" title="Resize preview panel" aria-label={`Resize ${name}`} onPointerDown={(event) => startWidgetResize(event, id)}><UiIcon name="resize" /></button></article></div> })}</div></>}<div className="sr-only" aria-live="polite">{draggingId ? `Rearranging ${previews[draggingId]?.item.name ?? 'preview widget'}` : resizingId ? `Resizing ${previews[resizingId]?.item.name ?? 'preview widget'}` : ''}</div></section>
}

function PreviewContent({ preview, compact = false }: { preview?: FilePreview; compact?: boolean }): React.JSX.Element {
  if (!preview) return <div className="preview-loading">LOADING PREVIEW…</div>
  if (preview.kind === 'image') return <div className="visual-preview"><img src={preview.dataUrl} alt={preview.item.name} /></div>
  if (preview.kind === 'audio') return <div className="media-preview"><div className="file-monogram">AU</div><audio controls src={preview.dataUrl} /></div>
  if (preview.kind === 'video') return <div className="visual-preview"><video controls src={preview.dataUrl} /></div>
  if (preview.kind === 'pdf') return <iframe className="pdf-preview" src={preview.dataUrl} title={preview.item.name} />
  if (preview.kind === 'html') return <iframe className="office-preview" sandbox="" srcDoc={preview.content} title={preview.item.name} />
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
  return <section className="floating-preview" style={{ left: state.x, top: state.y, width: state.width, height: state.height, zIndex: state.z }} onPointerDown={onFocus}><header onPointerDown={startMove}><span className="preview-file-icon">{preview ? <FileIcon item={preview.item} /> : <UiIcon name="file" />}</span><strong>{preview?.item.name ?? 'Preview'}</strong><button onPointerDown={(event) => event.stopPropagation()} onClick={() => preview && void window.tempVault.revealItem(preview.item.id)}><UiIcon name="folder" /></button><button onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button></header><div className="floating-content"><PreviewContent preview={preview} /></div><i className="resize-handle" onPointerDown={startResize} /></section>
}

function AgentPanel({ selectedIds, settings, onSettings }: { selectedIds: string[]; settings: VaultSnapshot['settings']; onSettings(): void }): React.JSX.Element {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [datasetQuestion, setDatasetQuestion] = useState('')
  const [datasetAnswer, setDatasetAnswer] = useState('')
  const [datasetSource, setDatasetSource] = useState('')
  const [examples, setExamples] = useState<Array<{ question: string; answer: string; source: string }>>([])
  const [datasetNotice, setDatasetNotice] = useState('')
  useEffect(() => { void window.tempVault.getAgentStatus().then(setStatus) }, [settings.agentModel])
  async function ask(): Promise<void> {
    const value = question.trim(); if (!value || thinking) return
    setMessages((current) => [...current, { role: 'user', content: value }]); setQuestion(''); setThinking(true)
    try { const answer = await window.tempVault.askAgent(value, selectedIds); setMessages((current) => [...current, { role: 'assistant', content: answer.answer, answer }]) } catch (error) { setMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : String(error) }]) } finally { setThinking(false) }
  }
  function addExample(): void {
    if (!datasetQuestion.trim() || !datasetAnswer.trim()) return
    setExamples((current) => [...current, { question: datasetQuestion.trim(), answer: datasetAnswer.trim(), source: datasetSource.trim() }])
    setDatasetQuestion(''); setDatasetAnswer(''); setDatasetSource(''); setDatasetNotice('Example added')
  }
  async function copyDataset(): Promise<void> {
    const system = 'You are TempVault Agent. Ground every answer in supplied file context, cite filenames in square brackets, and never invent file contents.'
    const jsonl = examples.map((example) => JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: example.source ? `Source: ${example.source}\n${example.question}` : example.question }, { role: 'assistant', content: example.answer }] })).join('\n')
    await navigator.clipboard.writeText(jsonl); setDatasetNotice(`${examples.length} JSONL example${examples.length === 1 ? '' : 's'} copied`)
  }
  return <div className="agent-panel"><div className="agent-status"><div><i className={status?.available ? 'online' : ''} /><span>{status?.message ?? 'Checking local runtime…'}</span></div><button onClick={onSettings}>CONFIGURE</button></div><div className="agent-intro"><b>FILE AGENT</b><p>Answers from your local vault using <strong>{settings.agentModel}</strong>. File data is sent only to Ollama at 127.0.0.1.</p><span>{selectedIds.length ? `${selectedIds.length} selected files prioritized · all vault files available` : 'All vault files available as context'}</span></div><details className="training-panel" open><summary>TRAIN LOCAL MODEL <span>DATASET + STEPS</span></summary><div className="training-content"><ol><li>Create representative question/answer examples below; remove private data you do not want memorized.</li><li>Copy the JSONL and fine-tune <strong>gemma3:4b</strong> externally with LoRA/QLoRA using LLaMA-Factory, Axolotl, or Unsloth.</li><li>Export the result as GGUF, then create <code>tempvault-agent</code> with Ollama.</li></ol><code className="training-command">ollama create tempvault-agent -f .\Modelfile</code><div className="dataset-form"><input value={datasetSource} onChange={(event) => setDatasetSource(event.target.value)} placeholder="Source filename or context label" /><textarea value={datasetQuestion} onChange={(event) => setDatasetQuestion(event.target.value)} placeholder="Training question" /><textarea value={datasetAnswer} onChange={(event) => setDatasetAnswer(event.target.value)} placeholder="Ideal grounded answer" /><div><span>{examples.length} EXAMPLES · {datasetNotice}</span><button disabled={!datasetQuestion.trim() || !datasetAnswer.trim()} onClick={addExample}>ADD EXAMPLE</button><button disabled={!examples.length} onClick={() => void copyDataset()}>COPY JSONL</button></div></div></div></details><div className="chat-log">{messages.map((message, index) => <div key={index} className={`message ${message.role}`}><small>{message.role === 'user' ? 'YOU' : 'LOCAL AGENT'}</small><p>{message.content}</p>{message.answer && <span>{message.answer.sources.length} files supplied · {message.answer.model}</span>}</div>)}{thinking && <div className="message assistant"><small>LOCAL AGENT</small><p className="thinking">READING FILES…</p></div>}</div><div className="composer"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} placeholder="Ask anything about your files…" /><div><span>ENTER TO SEND · LOCAL ONLY</span><button disabled={!question.trim() || thinking} onClick={() => void ask()}>↑</button></div></div></div>
}

function Dock({ onAdd, onInbox, onPreview, onAgent, onZoomIn, onZoomOut, onRefresh, onSettings, active }: { onAdd(): void; onInbox(): void; onPreview(): void; onAgent(): void; onZoomIn(): void; onZoomOut(): void; onRefresh(): void; onSettings(): void; active: Panel }): React.JSX.Element {
  const actions = [
    { icon: 'add', label: 'Add files', action: onAdd }, { icon: 'inbox', label: 'Inbox', action: onInbox },
    { icon: 'preview', label: 'Previews', action: onPreview, active: active === 'preview' }, { icon: 'sparkles', label: 'Local agent', action: onAgent, active: active === 'agent' },
    { icon: 'zoomOut', label: 'Zoom out', action: onZoomOut }, { icon: 'zoomIn', label: 'Zoom in', action: onZoomIn },
    { icon: 'refresh', label: 'Refresh', action: onRefresh }, { icon: 'settings', label: 'Appearance', action: onSettings }
  ]
  return <nav className="app-dock" aria-label="Quick actions">{actions.map((item) => <button key={item.label} className={item.active ? 'active' : ''} onClick={item.action} aria-label={item.label}><span><UiIcon name={item.icon} /></span><i>{item.label}</i></button>)}</nav>
}

function FileIcon({ item }: { item: VaultItem }): React.JSX.Element {
  const name = item.category === 'Images' ? 'image' : item.category === 'Audio' ? 'audio' : item.category === 'Videos' ? 'video' : item.category === 'Folders' ? 'folder' : item.category === 'Archives' ? 'archive' : item.category === 'Code' ? 'code' : 'file'
  const extension = item.extension.toLowerCase()
  const color = ['doc', 'docx'].includes(extension) ? '#2b6cb0' : extension === 'pdf' ? '#e53935' : ['xls', 'xlsx', 'csv'].includes(extension) ? '#16835d' : ['ppt', 'pptx'].includes(extension) ? '#d65a31' : item.category === 'Archives' ? '#f59e0b' : item.category === 'Images' ? '#a855f7' : item.category === 'Audio' ? '#ec4899' : item.category === 'Videos' ? '#06b6d4' : item.category === 'Code' ? '#3b82f6' : item.category === 'Folders' ? '#eab308' : '#64748b'
  return <span className="file-type-icon" style={{ '--file-color': color } as React.CSSProperties}><UiIcon name={name} /></span>
}

function UiIcon({ name }: { name: string }): React.JSX.Element {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'add') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  if (name === 'inbox') return <svg {...common}><path d="M4 4h16v14H4zM4 14h5l2 2h2l2-2h5" /></svg>
  if (name === 'preview') return <svg {...common}><path d="M2.8 12s3.5-6 9.2-6 9.2 6 9.2 6-3.5 6-9.2 6-9.2-6-9.2-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
  if (name === 'sparkles') return <svg {...common}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3ZM5 13l.9 2.6 2.6.9-2.6.9L5 20l-.9-2.6-2.6-.9 2.6-.9L5 13Z" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8A7 7 0 0 1 18 6l2 2M18 16a7 7 0 0 1-11.9 2L4 16" /></svg>
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
  if (name === 'zoomIn') return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" /></svg>
  if (name === 'zoomOut') return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M7.5 10.5h6" /></svg>
  if (name === 'halfWidth') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16M15 12h4M17 10l2 2-2 2" /></svg>
  if (name === 'halfHeight') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18M12 15v3M10 17l2 2 2-2" /></svg>
  if (name === 'resize') return <svg {...common}><path d="M10 20h10V10M14 20l6-6M18 20l2-2" /></svg>
  if (name === 'grip') return <svg {...common}><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" /></svg>
  if (name === 'wide') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 12h8M14 9l3 3-3 3M10 9l-3 3 3 3" /></svg>
  if (name === 'compact') return <svg {...common}><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 12h6M11 9l-3 3 3 3M13 9l3 3-3 3" /></svg>
  if (name === 'detach') return <svg {...common}><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 13v6H5V5h6" /></svg>
  if (name === 'folder') return <svg {...common}><path d="M3 6h6l2 2h10v11H3z" /></svg>
  if (name === 'image') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.5 3.5 2-2L20 19" /></svg>
  if (name === 'audio') return <svg {...common}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>
  if (name === 'video') return <svg {...common}><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-3v10l-4-3" /></svg>
  if (name === 'archive') return <svg {...common}><path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6" /></svg>
  if (name === 'code') return <svg {...common}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></svg>
  return <svg {...common}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></svg>
}

function Settings({ snapshot, onClose, onSaved }: { snapshot: VaultSnapshot; onClose(): void; onSaved(): Promise<void> }): React.JSX.Element {
  const [days, setDays] = useState(snapshot.settings.staleDays); const [startup, setStartup] = useState(snapshot.settings.launchAtStartup); const [theme, setTheme] = useState(snapshot.settings.theme); const [model, setModel] = useState(snapshot.settings.agentModel); const [accent, setAccent] = useState(snapshot.settings.accentColor); const [background, setBackground] = useState(snapshot.settings.backgroundColor); const [gradientEnabled, setGradientEnabled] = useState(snapshot.settings.gradientEnabled); const [gradientColor, setGradientColor] = useState(snapshot.settings.gradientColor); const [secondaryColor, setSecondaryColor] = useState(snapshot.settings.secondaryColor); const [autoPreview, setAutoPreview] = useState(snapshot.settings.autoPreview); const [saving, setSaving] = useState(false)
  const accents = ['#ffffff', '#60a5fa', '#22d3ee', '#4ade80', '#ffd43b', '#ff5c5c', '#f472b6', '#a78bfa']
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal"><header><div><p>CONFIGURATION</p><h2>SETTINGS</h2></div><button onClick={onClose}>×</button></header><div className="settings-scroll">
    <Setting label="REVIEW AGE" hint="Mark temporary files for review after this many days."><label><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /> DAYS</label></Setting>
    <Setting label="APPEARANCE" hint="Switch the interface contrast mode."><div className="segmented"><button className={theme === 'dark' ? 'active' : ''} onClick={() => { setTheme('dark'); setBackground('#080a0b'); setGradientColor('#17120f') }}>DARK</button><button className={theme === 'light' ? 'active' : ''} onClick={() => { setTheme('light'); setBackground('#f7f3ec'); setGradientColor('#ddd2c4') }}>LIGHT</button></div></Setting>
    <Setting label="BACKGROUND FILL" hint="Use a solid primary color or blend it into a gradient."><div className="segmented"><button className={!gradientEnabled ? 'active' : ''} onClick={() => setGradientEnabled(false)}>SOLID</button><button className={gradientEnabled ? 'active' : ''} onClick={() => setGradientEnabled(true)}>GRADIENT</button></div></Setting>
    <Setting label="PRIMARY COLOR" hint="Base color for the complete application background."><label className="color-input"><input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /><code>{background.toUpperCase()}</code></label></Setting>
    {gradientEnabled && <Setting label="GRADIENT COLOR" hint="The second color used by the background gradient."><label className="color-input"><input type="color" value={gradientColor} onChange={(event) => setGradientColor(event.target.value)} /><code>{gradientColor.toUpperCase()}</code></label></Setting>}
    <Setting label="SECONDARY COLOR" hint="Color for the sidebar, selected rows and active surfaces."><label className="color-input"><input type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} /><code>{secondaryColor.toUpperCase()}</code></label></Setting>
    <Setting label="ACCENT COLOR" hint="Used for focus rings, file selection and preview activity."><div className="color-choices">{accents.map((color) => <button key={color} className={accent === color ? 'active' : ''} style={{ background: color }} onClick={() => setAccent(color)} aria-label={`Accent ${color}`} />)}<input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></div></Setting>
    <Setting label="AUTOMATIC QUICK PREVIEW" hint="Preview the latest selected file without pinning it to the board."><label className="switch"><input type="checkbox" checked={autoPreview} onChange={(event) => setAutoPreview(event.target.checked)} /><i /></label></Setting>
    <Setting label="LOCAL AI MODEL" hint="Exact Ollama model name. Recommended custom name: tempvault-agent."><input className="model-input" value={model} onChange={(event) => setModel(event.target.value)} /></Setting>
    <Setting label="LAUNCH AT STARTUP" hint="Open TempVault when you sign in."><label className="switch"><input type="checkbox" checked={startup} onChange={(event) => setStartup(event.target.checked)} /><i /></label></Setting>
    <div className="location-setting"><span>STORAGE LOCATION</span><code>{snapshot.settings.storageRoot}</code></div></div><footer><button onClick={onClose}>CANCEL</button><button className="solid" disabled={saving} onClick={async () => { setSaving(true); await window.tempVault.updateSettings({ staleDays: Math.max(1, Math.min(365, days)), launchAtStartup: startup, theme, agentModel: model, accentColor: accent, backgroundColor: background, gradientEnabled, gradientColor, secondaryColor, autoPreview }); await onSaved() }}>SAVE</button></footer></section></div>
}
function Setting({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }): React.JSX.Element { return <div className="setting-row"><div><strong>{label}</strong><p>{hint}</p></div>{children}</div> }

function fileTypeLabel(item: VaultItem): string {
  if (item.category === 'Folders') return 'Folder'
  const extension = item.extension.toLowerCase()
  const labels: Record<string, string> = {
    doc: 'Microsoft Word', docx: 'Microsoft Word', odt: 'OpenDocument text', pdf: 'PDF document', rtf: 'Rich text', txt: 'Plain text', md: 'Markdown',
    xls: 'Microsoft Excel', xlsx: 'Microsoft Excel', ods: 'OpenDocument spreadsheet', csv: 'CSV spreadsheet', tsv: 'TSV spreadsheet',
    ppt: 'Microsoft PowerPoint', pptx: 'Microsoft PowerPoint', odp: 'OpenDocument presentation',
    zip: 'ZIP archive', rar: 'RAR archive', '7z': '7-Zip archive', tar: 'TAR archive', gz: 'GZip archive', iso: 'Disc image',
    png: 'PNG image', jpg: 'JPEG image', jpeg: 'JPEG image', gif: 'GIF image', webp: 'WebP image', svg: 'SVG image', bmp: 'Bitmap image',
    mp4: 'MP4 video', mkv: 'Matroska video', mov: 'QuickTime video', webm: 'WebM video',
    mp3: 'MP3 audio', wav: 'Wave audio', flac: 'FLAC audio', m4a: 'MPEG-4 audio',
    ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React', py: 'Python', json: 'JSON', html: 'HTML', css: 'CSS', ino: 'Arduino sketch',
    exe: 'Windows application', msi: 'Windows installer', ttf: 'TrueType font', otf: 'OpenType font'
  }
  return labels[extension] ?? (extension ? `${extension.toUpperCase()} file` : item.category.slice(0, -1))
}

function viewTitle(view: View): string { return ({ all: 'FILE RECORDS', temporary: 'TEMPORARY', kept: 'KEPT FILES', stale: 'NEEDS REVIEW', folders: 'GLASS FOLDERS' })[view] }
function formatBytes(bytes: number): string { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}` }
function relativeDate(timestamp: number): string { const days = Math.floor((Date.now() - timestamp) / 86_400_000); if (days <= 0) return 'TODAY'; if (days === 1) return 'YESTERDAY'; if (days < 30) return `${days}D AGO`; return new Date(timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() }
function shortPath(path: string): string { const parts = path.split(/[\\/]/); return parts.slice(-3, -1).join(' / ').toUpperCase() }
