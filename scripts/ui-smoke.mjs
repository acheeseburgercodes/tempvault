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
  if (rows.length < 3) throw new Error('Expected at least three QA file records')
  rows[0].querySelector('input').click()
  rows[1].querySelector('input').click()
  await pause(500)
  const widgets = document.querySelectorAll('.preview-widget')
  if (widgets.length !== 2) throw new Error('Multi-file previews did not render')
  widgets[0].querySelector('header button').click()
  await pause(100)
  if (document.querySelectorAll('.floating-preview').length !== 1) throw new Error('Detached preview did not render')
  document.querySelector('.title-actions button:last-child').click()
  await pause(350)
  const theme = document.documentElement.dataset.theme
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  document.querySelectorAll('.rail-tabs button')[1].click()
  await pause(2300)
  return {
    records: rows.length,
    previews: widgets.length,
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
