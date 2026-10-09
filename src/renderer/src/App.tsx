import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATEGORIES, type Category, type OperationResult, type VaultItem, type VaultSnapshot } from '../../shared/types'

type View = 'all' | 'temporary' | 'kept' | 'stale'
type SortKey = 'name' | 'category' | 'size' | 'modifiedAt'

const icons: Record<string, string> = {
  Images: '▧', Videos: '▶', Audio: '♫', Documents: '▤', Spreadsheets: '▦',
  Presentations: '▣', Archives: '◆', Installers: '↓', Code: '⌘', Fonts: 'Aa', Folders: '▰', Other: '◇'
}

export default function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null)
  const [view, setView] = useState<View>('all')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'modifiedAt', descending: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const next = await window.tempVault.getSnapshot()
    setSnapshot(next)
    setSelected((current) => new Set([...current].filter((id) => next.items.some((item) => item.id === id))))
  }, [])

  useEffect(() => {
    void refresh()
    return window.tempVault.onVaultChanged(() => void refresh())
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3_500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const staleBoundary = Date.now() - (snapshot?.settings.staleDays ?? 7) * 86_400_000
  const items = useMemo(() => {
    if (!snapshot) return []
    const query = search.trim().toLowerCase()
    return snapshot.items
      .filter((item) => {
        if (view === 'temporary' && item.status !== 'temporary') return false
        if (view === 'kept' && item.status !== 'kept') return false
        if (view === 'stale' && !(item.status === 'temporary' && item.modifiedAt < staleBoundary)) return false
        if (category !== 'all' && item.category !== category) return false
        return !query || item.name.toLowerCase().includes(query) || item.extension.includes(query)
      })
      .sort((a, b) => {
        const left = a[sort.key]
        const right = b[sort.key]
        const compared = typeof left === 'string' ? left.localeCompare(String(right)) : left - Number(right)
        return sort.descending ? -compared : compared
      })
  }, [snapshot, search, view, category, sort, staleBoundary])

  const selectedItems = snapshot?.items.filter((item) => selected.has(item.id)) ?? []

  async function perform(label: string, task: () => Promise<OperationResult>): Promise<void> {
    setBusy(true)
    try {
      const result = await task()
      setSelected(new Set())
      await refresh()
      if (result.failed.length) setToast(`${label}: ${result.succeeded.length} completed, ${result.failed.length} failed`)
      else if (result.succeeded.length) setToast(`${label}: ${result.succeeded.length} item${result.succeeded.length === 1 ? '' : 's'}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  function toggleSort(key: SortKey): void {
    setSort((current) => ({ key, descending: current.key === key ? !current.descending : key !== 'name' && key !== 'category' }))
  }

  function toggleItem(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDrop(event: React.DragEvent): Promise<void> {
    event.preventDefault()
    setDragging(false)
    const paths = Array.from(event.dataTransfer.files).map((file) => window.tempVault.pathForFile(file)).filter(Boolean)
    if (paths.length) await perform('Added', () => window.tempVault.addFiles(paths))
  }

  async function trashSelected(): Promise<void> {
    if (!selected.size) return
    if (window.confirm(`Send ${selected.size} selected item${selected.size === 1 ? '' : 's'} to the Recycle Bin?`)) {
      await perform('Recycled', () => window.tempVault.trash([...selected]))
    }
  }

  if (!snapshot) return <div className="loading"><div className="vault-mark">TV</div><span>Opening your vault…</span></div>

  return (
    <div className="app-shell" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={(event) => void handleDrop(event)}>
      <header className="titlebar"><div className="brand"><span className="vault-mark small">TV</span><span>TempVault</span><em>LOCAL</em></div></header>
      <aside className="sidebar">
        <nav>
          <NavItem active={view === 'all'} label="All files" count={snapshot.items.length} icon="◫" onClick={() => setView('all')} />
          <NavItem active={view === 'temporary'} label="Temporary" count={snapshot.totals.temporary} icon="◷" onClick={() => setView('temporary')} />
          <NavItem active={view === 'kept'} label="Kept" count={snapshot.totals.kept} icon="★" onClick={() => setView('kept')} />
          <NavItem active={view === 'stale'} label="Needs review" count={snapshot.totals.stale} icon="!" accent onClick={() => setView('stale')} />
        </nav>
        <div className="sidebar-label">Locations</div>
        <button className="side-action" onClick={() => void window.tempVault.openInbox()}><span>▰</span> Watched inbox</button>
        <div className="storage-card">
          <div className="storage-head"><span>Vault usage</span><strong>{formatBytes(snapshot.totals.bytes)}</strong></div>
          <div className="meter"><i style={{ width: `${Math.min(100, Math.max(4, snapshot.totals.bytes / 1_000_000_000 * 100))}%` }} /></div>
          <p title={snapshot.settings.storageRoot}>{snapshot.settings.storageRoot}</p>
        </div>
        <button className="settings-button" onClick={() => setSettingsOpen(true)}>⚙ <span>Settings</span></button>
      </aside>

      <main>
        <section className="hero-row">
          <div><p className="eyebrow">PRIVATE TEMPORARY STORAGE</p><h1>{viewTitle(view)}</h1><p className="subtitle">Files stay on this computer. Nothing is uploaded.</p></div>
          <div className="add-actions"><button className="secondary" onClick={() => void perform('Added', () => window.tempVault.addFolder())}>Add folder</button><button className="primary" onClick={() => void perform('Added', () => window.tempVault.addFiles())}>＋ Add files</button></div>
        </section>

        <section className="stats-grid">
          <Stat label="Vault size" value={formatBytes(snapshot.totals.bytes)} note={`${snapshot.items.length} total items`} />
          <Stat label="Temporary" value={String(snapshot.totals.temporary)} note="Awaiting a decision" />
          <Stat label="Kept safe" value={String(snapshot.totals.kept)} note="Excluded from cleanup" />
          <Stat label="Needs review" value={String(snapshot.totals.stale)} note={`Older than ${snapshot.settings.staleDays} days`} warning={snapshot.totals.stale > 0} />
        </section>

        <section className="vault-panel">
          <div className="toolbar">
            <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files…" /></label>
            <select value={category} onChange={(event) => setCategory(event.target.value as Category | 'all')}><option value="all">All types</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>
            <button className="icon-button" title="Refresh" onClick={() => void refresh()}>↻</button>
          </div>

          {selected.size > 0 && <div className="selection-bar"><strong>{selected.size} selected</strong><div><button disabled={busy || selectedItems.every((item) => item.status === 'kept')} onClick={() => void perform('Kept', () => window.tempVault.keep([...selected]))}>★ Keep</button><button disabled={busy || selectedItems.every((item) => item.status === 'temporary')} onClick={() => void perform('Restored', () => window.tempVault.restore([...selected]))}>↶ Make temporary</button><button disabled={busy} onClick={() => void perform('Moved', () => window.tempVault.moveOut([...selected]))}>Move out…</button><button className="danger" disabled={busy} onClick={() => void trashSelected()}>Recycle</button><button className="close-selection" onClick={() => setSelected(new Set())}>×</button></div></div>}

          {items.length ? <div className="table-wrap"><table><thead><tr><th className="check-cell"><input type="checkbox" checked={items.every((item) => selected.has(item.id))} onChange={() => setSelected(items.every((item) => selected.has(item.id)) ? new Set() : new Set(items.map((item) => item.id)))} /></th><SortHead label="Name" column="name" sort={sort} onClick={toggleSort} /><SortHead label="Type" column="category" sort={sort} onClick={toggleSort} /><th>Status</th><SortHead label="Size" column="size" sort={sort} onClick={toggleSort} /><SortHead label="Modified" column="modifiedAt" sort={sort} onClick={toggleSort} /><th /></tr></thead><tbody>{items.map((item) => <FileRow key={item.id} item={item} selected={selected.has(item.id)} stale={item.status === 'temporary' && item.modifiedAt < staleBoundary} onToggle={toggleItem} />)}</tbody></table></div> : <EmptyState filtered={Boolean(search || category !== 'all' || view !== 'all')} onAdd={() => void perform('Added', () => window.tempVault.addFiles())} />}
          <footer className="panel-footer"><span>{items.length} shown</span><span>{formatBytes(items.reduce((sum, item) => sum + item.size, 0))}</span></footer>
        </section>
      </main>

      {dragging && <div className="drop-zone"><div><span>↓</span><h2>Drop to store temporarily</h2><p>Items will move into your private D: drive vault.</p></div></div>}
      {settingsOpen && <Settings snapshot={snapshot} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await refresh(); setToast('Settings saved') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function NavItem({ active, label, count, icon, accent, onClick }: { active: boolean; label: string; count: number; icon: string; accent?: boolean; onClick(): void }): React.JSX.Element {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className={`nav-icon ${accent ? 'accent' : ''}`}>{icon}</span><span>{label}</span><b>{count}</b></button>
}

function Stat({ label, value, note, warning }: { label: string; value: string; note: string; warning?: boolean }): React.JSX.Element {
  return <article className={`stat ${warning ? 'warning' : ''}`}><span>{label}</span><strong>{value}</strong><p>{note}</p></article>
}

function SortHead({ label, column, sort, onClick }: { label: string; column: SortKey; sort: { key: SortKey; descending: boolean }; onClick(key: SortKey): void }): React.JSX.Element {
  return <th><button className="sort-head" onClick={() => onClick(column)}>{label} {sort.key === column && <i>{sort.descending ? '↓' : '↑'}</i>}</button></th>
}

function FileRow({ item, selected, stale, onToggle }: { item: VaultItem; selected: boolean; stale: boolean; onToggle(id: string): void }): React.JSX.Element {
  return <tr className={selected ? 'selected' : ''} onDoubleClick={() => void window.tempVault.openItem(item.id)}><td className="check-cell"><input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} /></td><td><div className="file-name"><span className={`file-icon cat-${item.category.toLowerCase()}`}>{icons[item.category]}</span><div><strong title={item.name}>{item.name}</strong><small>{item.extension ? item.extension.toUpperCase() : 'FOLDER'}</small></div></div></td><td>{item.category}</td><td><span className={`status ${item.status} ${stale ? 'stale' : ''}`}>{stale ? 'Review' : item.status === 'kept' ? 'Kept' : 'Temporary'}</span></td><td>{formatBytes(item.size)}</td><td title={new Date(item.modifiedAt).toLocaleString()}>{relativeDate(item.modifiedAt)}</td><td><button className="row-menu" title="Show in Explorer" onClick={() => void window.tempVault.revealItem(item.id)}>•••</button></td></tr>
}

function EmptyState({ filtered, onAdd }: { filtered: boolean; onAdd(): void }): React.JSX.Element {
  return <div className="empty"><span>{filtered ? '⌕' : '◇'}</span><h2>{filtered ? 'No matching files' : 'Your vault is empty'}</h2><p>{filtered ? 'Try changing your filters or search.' : 'Add files or drop them anywhere in this window.'}</p>{!filtered && <button className="primary" onClick={onAdd}>Add your first files</button>}</div>
}

function Settings({ snapshot, onClose, onSaved }: { snapshot: VaultSnapshot; onClose(): void; onSaved(): Promise<void> }): React.JSX.Element {
  const [days, setDays] = useState(snapshot.settings.staleDays)
  const [startup, setStartup] = useState(snapshot.settings.launchAtStartup)
  const [saving, setSaving] = useState(false)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal"><header><div><p className="eyebrow">PREFERENCES</p><h2>Settings</h2></div><button onClick={onClose}>×</button></header><div className="setting-row"><div><strong>Review age</strong><p>Temporary files older than this are marked for review.</p></div><label><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /> days</label></div><div className="setting-row"><div><strong>Launch at startup</strong><p>Start TempVault automatically when you sign in.</p></div><label className="switch"><input type="checkbox" checked={startup} onChange={(event) => setStartup(event.target.checked)} /><i /></label></div><div className="path-setting"><span>Storage location</span><code>{snapshot.settings.storageRoot}</code><small>Fixed to D: to keep temporary data off your system drive.</small></div><footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving} onClick={async () => { setSaving(true); await window.tempVault.updateSettings({ staleDays: Math.max(1, Math.min(365, days)), launchAtStartup: startup }); await onSaved() }}>Save changes</button></footer></section></div>
}

function viewTitle(view: View): string { return ({ all: 'Your vault', temporary: 'Temporary files', kept: 'Files you kept', stale: 'Needs your review' })[view] }
function formatBytes(bytes: number): string { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}` }
function relativeDate(timestamp: number): string { const days = Math.floor((Date.now() - timestamp) / 86_400_000); if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday'; if (days < 30) return `${days} days ago`; return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }
