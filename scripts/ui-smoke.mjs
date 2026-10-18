const port = process.argv[2] || '9224'
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
if (!pages.length) throw new Error('No Electron renderer is available')

const socket = new WebSocket(pages[0].webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const listener = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== id) return
      socket.removeEventListener('message', listener)
      if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text))
      else resolve(message.result?.result?.value)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
}

const result = await evaluate(`(async () => {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const rows = [...document.querySelectorAll('.record-row')]
  const header = document.querySelector('.record-header')
  const rowsAreSeparate = rows.every((row) => !header?.contains(row))
  const rowsDoNotOverflow = rows.every((row) => row.scrollWidth <= row.clientWidth + 1)
  const rowsStackVertically = rows.every((row, index) => index === 0 || row.getBoundingClientRect().top >= rows[index - 1].getBoundingClientRect().bottom - 1)
  if (!rowsAreSeparate || !rowsDoNotOverflow || !rowsStackVertically) throw new Error('File record layout overlaps or overflows')
  if (rows.some((row) => !row.querySelector('.record-name svg'))) throw new Error('File list icons did not render')
  const iconColors = new Set(rows.map((row) => getComputedStyle(row.querySelector('.file-type-icon')).color))
  if (rows.length > 1 && iconColors.size < 2) throw new Error('File icons are not color-coded by type')
  const wordRow = rows.find((row) => row.querySelector('.record-name strong')?.textContent?.toLowerCase().endsWith('.docx'))
  if (wordRow && !wordRow.textContent.includes('MICROSOFT WORD')) throw new Error('Specific Word file type is missing')
  const maxRowHeight = Math.max(0, ...rows.map((row) => row.getBoundingClientRect().height))
  if (maxRowHeight > 55) throw new Error('File records are no longer compact')
  const sidebarStyle = getComputedStyle(document.querySelector('.sidebar'))
  const workspaceStyle = getComputedStyle(document.querySelector('.workspace'))
  const shellStyle = getComputedStyle(document.querySelector('.app-shell'))
  if (sidebarStyle.backdropFilter === 'none') throw new Error('Sidebar glass blur is missing')
  if (shellStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || workspaceStyle.backgroundColor === 'rgba(0, 0, 0, 0)') throw new Error('Opaque panel canvas is missing')
  const leftOutline = getComputedStyle(document.querySelector('.sidebar'), '::after')
  const rightOutline = getComputedStyle(document.querySelector('.right-rail'), '::after')
  if (leftOutline.borderTopColor !== rightOutline.borderTopColor || leftOutline.borderTopWidth !== rightOutline.borderTopWidth || leftOutline.borderRadius !== rightOutline.borderRadius) throw new Error('Side panel outlines do not match')
  const rail = document.querySelector('.right-rail')
  const railBefore = rail.getBoundingClientRect()
  const widthHandle = rail.querySelector('.rail-resizer-width')
  const heightHandle = rail.querySelector('.rail-resizer-height')
  const widthDirection = railBefore.width > 400 ? 28 : -28
  widthHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, buttons: 1, clientX: railBefore.left, clientY: railBefore.top + 100 }))
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: railBefore.left + widthDirection, clientY: railBefore.top + 100 }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: railBefore.left + widthDirection, clientY: railBefore.top + 100 }))
  await pause(80)
  const railWider = rail.getBoundingClientRect()
  if (Math.abs(railWider.width - railBefore.width) < 20) throw new Error('Preview rail width resize failed')
  heightHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, buttons: 1, clientX: railWider.left + 100, clientY: railWider.bottom }))
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: railWider.left + 100, clientY: railWider.bottom - 24 }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: railWider.left + 100, clientY: railWider.bottom - 24 }))
  await pause(80)
  if (rail.getBoundingClientRect().height > railWider.height - 16) throw new Error('Preview rail height resize failed')
  const layoutButtons = [...rail.querySelectorAll('.rail-layout-actions button')]
  if (layoutButtons.length !== 2 || layoutButtons.some((button) => !button.querySelector('svg'))) throw new Error('Half-screen layout controls are missing')
  layoutButtons[0].click(); await pause(80)
  let halfWidth = rail.getBoundingClientRect().width
  const expectedHalfWidth = Math.max(310, Math.min(window.innerWidth - 760, Math.round(window.innerWidth / 2))) - 8
  if (Math.abs(halfWidth - expectedHalfWidth) > 3) { layoutButtons[0].click(); await pause(80); halfWidth = rail.getBoundingClientRect().width }
  if (Math.abs(halfWidth - expectedHalfWidth) > 3) throw new Error('Half-screen width preset failed: got ' + halfWidth + ', expected ' + expectedHalfWidth + ', viewport ' + window.innerWidth)
  layoutButtons[1].click(); await pause(80)
  let halfHeight = rail.getBoundingClientRect().height
  const expectedHalfHeight = Math.max(320, Math.round((window.innerHeight - 60) / 2))
  if (Math.abs(halfHeight - expectedHalfHeight) > 3) { layoutButtons[1].click(); await pause(80); halfHeight = rail.getBoundingClientRect().height }
  if (Math.abs(halfHeight - expectedHalfHeight) > 3) throw new Error('Half-screen height preset failed')
  const dock = document.querySelector('.app-dock')
  const dockBounds = dock.getBoundingClientRect()
  const workspaceBounds = document.querySelector('.workspace').getBoundingClientRect()
  const dockOffset = Math.abs((dockBounds.left + dockBounds.width / 2) - (workspaceBounds.left + workspaceBounds.width / 2))
  if (dockOffset > 2 || dock.querySelectorAll('button svg').length !== dock.querySelectorAll('button').length) throw new Error('Dock alignment or icons are incorrect')
  let previewCheck = 'skipped (vault has fewer than two files)'
  let wordPreview = 'skipped (no selected .docx file)'
  if (rows.length >= 2) {
    for (const row of rows) {
      const checkbox = row.querySelector('input')
      if (checkbox.checked) checkbox.click()
    }
    await pause(100)
    rows[0].querySelector('input').click()
    rows[1].querySelector('input').click()
    await pause(500)
    const widgets = document.querySelectorAll('.preview-widget')
    if (widgets.length !== 2) throw new Error('Multi-file previews did not render')
    if ([...widgets].some((widget) => !widget.querySelector('.preview-file-icon svg'))) throw new Error('Preview file icons did not render')
    if ([...widgets].some((widget) => widget.draggable || widget.querySelector('.widget-drag-zone')?.draggable)) throw new Error('Native browser dragging is still enabled for preview widgets')
    if ([...widgets].some((widget) => widget.getBoundingClientRect().height < 220)) throw new Error('Preview cards are too small')
    const grid = document.querySelector('.preview-grid')
    const slots = [...grid.querySelectorAll('.preview-grid-slot')]
    if (getComputedStyle(grid).display !== 'grid' || getComputedStyle(grid).gridTemplateColumns.split(' ').length !== 1 || slots.length !== widgets.length) throw new Error('Vertical widget grid did not render')
    if ([...widgets].some((widget) => !widget.querySelector('.widget-grip'))) throw new Error('Widget drag handles are missing')
    if ([...widgets].some((widget) => {
      const zone = widget.querySelector('.widget-drag-zone')
      const header = widget.querySelector('header')
      return !zone || !zone.querySelector('.preview-file-icon') || !zone.querySelector('strong') || zone.getBoundingClientRect().width < header.getBoundingClientRect().width * 0.42
    })) throw new Error('Widget header grab surfaces did not expand across the sidebar cards')
    const arrangedCard = widgets[1]
    const arrangedId = arrangedCard.dataset.previewId
    const targetBounds = widgets[0].getBoundingClientRect()
    const arrangedBounds = arrangedCard.getBoundingClientRect()
    const grip = arrangedCard.querySelector('.widget-grip')
    grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, buttons: 1, clientX: arrangedBounds.left + 12, clientY: arrangedBounds.top + 18 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, buttons: 1, clientX: targetBounds.left + targetBounds.width / 2, clientY: targetBounds.top + targetBounds.height / 2 }))
    await pause(50)
    if (!arrangedCard.classList.contains('drag-lifted') || !document.querySelector('.preview-grid-slot.drag-origin')) throw new Error('Lifted widget drag state did not render')
    const liftedBounds = arrangedCard.getBoundingClientRect()
    if (Math.abs(liftedBounds.width - arrangedBounds.width) > arrangedBounds.width * .08 || Math.abs(liftedBounds.height - arrangedBounds.height) > arrangedBounds.height * .08) throw new Error('Dragged widget changed size or produced the oversized oval')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: targetBounds.left + targetBounds.width / 2, clientY: targetBounds.top + targetBounds.height / 2 }))
    await pause(350)
    const reordered = [...document.querySelectorAll('.preview-grid-slot')]
    if (reordered[0]?.dataset.previewId !== arrangedId) throw new Error('Preview widgets did not reorder')
    const settledCards = reordered.map((slot) => slot.getBoundingClientRect())
    for (let a = 0; a < settledCards.length; a += 1) for (let b = a + 1; b < settledCards.length; b += 1) {
      const x = Math.min(settledCards[a].right, settledCards[b].right) - Math.max(settledCards[a].left, settledCards[b].left)
      const y = Math.min(settledCards[a].bottom, settledCards[b].bottom) - Math.max(settledCards[a].top, settledCards[b].top)
      if (x > 1 && y > 1) throw new Error('Preview widget grid allowed cards to overlap')
    }
    const docxWidget = [...widgets].find((widget) => widget.querySelector('header strong')?.textContent?.toLowerCase().endsWith('.docx'))
    if (docxWidget) {
      if (!docxWidget.querySelector('.office-preview')) throw new Error('Word preview did not render rich document content')
      wordPreview = 'passed (rich document iframe)'
    }
    const floatingBefore = document.querySelectorAll('.floating-preview').length
    const sourceCard = document.querySelector('.preview-widget')
    const sourceBounds = sourceCard.getBoundingClientRect()
    const workspaceTarget = document.querySelector('.workspace').getBoundingClientRect()
    sourceCard.querySelector('.widget-grip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, buttons: 1, clientX: sourceBounds.left + 12, clientY: sourceBounds.top + 18 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, buttons: 1, clientX: workspaceTarget.left + 180, clientY: workspaceTarget.top + 180 }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: workspaceTarget.left + 180, clientY: workspaceTarget.top + 180 }))
    await pause(100)
    if (document.querySelectorAll('.floating-preview').length !== floatingBefore + 1) throw new Error('Pointer-moved preview did not render')
    if (document.querySelectorAll('.preview-widget').length !== widgets.length - 1) throw new Error('Pointer-moved preview copied instead of moving')
    previewCheck = 'passed'
  }
  document.querySelector('.title-actions button:last-child').click()
  await pause(350)
  const theme = document.documentElement.dataset.theme
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  const themedSidebarStyle = getComputedStyle(document.querySelector('.sidebar'))
  const activeNavBackground = getComputedStyle(document.querySelector('.nav-item.active')).backgroundColor
  const bulkBackground = getComputedStyle(document.querySelector('.bulk')).backgroundColor
  if (theme === 'light' && (activeNavBackground === 'rgb(0, 0, 0)' || bulkBackground === 'rgb(0, 0, 0)')) throw new Error('Light mode still uses black selected panels')
  document.querySelectorAll('.rail-tabs button')[1].click()
  await pause(2300)
  const trainingPanel = document.querySelector('.training-panel')
  if (!trainingPanel || trainingPanel.querySelectorAll('.dataset-form textarea').length !== 2 || !trainingPanel.textContent.includes('COPY JSONL')) throw new Error('Training instructions or dataset form are missing')
  const zoomedIn = await window.tempVault.zoomIn()
  const zoomedOut = await window.tempVault.zoomOut()
  const zoomReset = await window.tempVault.zoomReset()
  if (!(zoomedIn > zoomedOut) || zoomReset !== 1) throw new Error('Zoom controls failed')
  const vaultSnapshot = await window.tempVault.getSnapshot()
  const previewCompatibility = {}
  for (const extension of ['doc', 'docx', 'pdf', 'ppt', 'pptx']) {
    const item = vaultSnapshot.items.find((candidate) => candidate.extension.toLowerCase() === extension)
    if (!item) { previewCompatibility[extension] = 'no fixture'; continue }
    const preview = await window.tempVault.getPreview(item.id)
    if (extension === 'pdf' && preview.kind !== 'pdf') throw new Error('PDF preview compatibility failed')
    if (['doc', 'docx', 'ppt', 'pptx'].includes(extension) && !['html', 'text'].includes(preview.kind)) throw new Error(extension.toUpperCase() + ' preview compatibility failed')
    previewCompatibility[extension] = preview.kind
  }
  const folderNav = [...document.querySelectorAll('.nav-item')].find((item) => item.textContent.includes('Type folders'))
  if (!folderNav) throw new Error('Type folder page navigation is missing')
  folderNav.click()
  await pause(450)
  const folderCards = [...document.querySelectorAll('.glass-folder-card')]
  if (rows.length && !folderCards.length) throw new Error('Glass folder cards did not render')
  if (rows.some((row) => row.querySelector('.record-name strong')?.textContent?.toLowerCase().endsWith('.pdf')) && !folderCards.some((card) => card.textContent.includes('PDFs'))) throw new Error('PDF files were not sorted into their own folder')
  if (rows.some((row) => /\.(doc|docx|txt|md)$/i.test(row.querySelector('.record-name strong')?.textContent || '')) && !folderCards.some((card) => card.textContent.includes('Word & text'))) throw new Error('Document files were not sorted into their own folder')
  folderCards[0]?.querySelector('.folder-cover')?.click()
  await pause(250)
  if (folderCards.length && !document.querySelector('.glass-folder-card.open .folder-files button')) throw new Error('Glass folder card did not open its file list')
  const folderView = { cards: folderCards.length, openFiles: document.querySelectorAll('.glass-folder-card.open .folder-files button').length }
  return {
    records: rows.length,
    layoutCheck: 'passed',
    maxRowHeight,
    dockOffset,
    sidebarGlass: { background: sidebarStyle.backgroundColor, blur: sidebarStyle.backdropFilter },
    panelOutline: { color: leftOutline.borderTopColor, width: leftOutline.borderTopWidth, radius: leftOutline.borderRadius },
    themedSidebarGlass: { background: themedSidebarStyle.backgroundColor, blur: themedSidebarStyle.backdropFilter },
    lightSelection: { activeNavBackground, bulkBackground },
    previewCheck,
    wordPreview,
    previewCompatibility,
    halfScreen: { width: halfWidth, height: halfHeight },
    floating: document.querySelectorAll('.floating-preview').length,
    theme,
    background,
    agentPanel: Boolean(document.querySelector('.agent-panel')),
    agentStatus: document.querySelector('.agent-status')?.textContent?.trim(),
    railText: document.querySelector('.right-rail')?.textContent?.slice(0, 300),
    heading: document.querySelector('h1')?.textContent,
    folderView,
    zoom: { zoomedIn, zoomedOut, zoomReset }
  }
})()`)

socket.close()
console.log(JSON.stringify(result, null, 2))
