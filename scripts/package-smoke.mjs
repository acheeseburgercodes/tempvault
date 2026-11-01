const port = process.argv[2] || '9224'
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = pages.find((candidate) => candidate.type === 'page')
if (!page) throw new Error('Packaged TempVault did not expose a renderer page')

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const result = await new Promise((resolve, reject) => {
  const id = 1
  const timeout = setTimeout(() => reject(new Error('Packaged renderer startup probe timed out')), 15_000)
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== id) return
    clearTimeout(timeout)
    if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text))
    else resolve(message.result?.result?.value)
  })
  socket.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const deadline = Date.now() + 10000
        while (!document.querySelector('.app-shell') && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        if (!document.querySelector('.app-shell')) throw new Error('TempVault application shell did not render')
        if (!window.tempVault?.getSnapshot) throw new Error('TempVault preload API is unavailable')
        const snapshot = await window.tempVault.getSnapshot()
        if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.settings) throw new Error('Vault snapshot IPC failed')
        return { title: document.title, records: snapshot.items.length, root: snapshot.root }
      })()`
    }
  }))
})

socket.close()
console.log(JSON.stringify({ packagedStartup: 'passed', ...result }, null, 2))
