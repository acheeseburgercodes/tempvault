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
    const docxWidget = [...widgets].find((widget) => widget.querySelector('header strong')?.textContent?.toLowerCase().endsWith('.docx'))
    if (docxWidget) {
      const wordText = docxWidget.querySelector('.text-preview')?.textContent?.trim() || ''
      if (wordText.length < 10) throw new Error('Word preview did not extract readable content')
      wordPreview = 'passed (' + wordText.length + ' characters)'
    }
    const floatingBefore = document.querySelectorAll('.floating-preview').length
    widgets[0].querySelector('header button').click()
    await pause(100)
    if (document.querySelectorAll('.floating-preview').length !== floatingBefore + 1) throw new Error('Detached preview did not render')
    previewCheck = 'passed'
  }
  document.querySelector('.title-actions button:last-child').click()
  await pause(350)
  const theme = document.documentElement.dataset.theme
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  document.querySelectorAll('.rail-tabs button')[1].click()
  await pause(2300)
  return {
    records: rows.length,
    layoutCheck: 'passed',
    previewCheck,
    wordPreview,
    floating: document.querySelectorAll('.floating-preview').length,
    theme,
    background,
    agentPanel: Boolean(document.querySelector('.agent-panel')),
    agentStatus: document.querySelector('.agent-status')?.textContent?.trim(),
    railText: document.querySelector('.right-rail')?.textContent?.slice(0, 300),
    heading: document.querySelector('h1')?.textContent
  }
})()`)

socket.close()
console.log(JSON.stringify(result, null, 2))
