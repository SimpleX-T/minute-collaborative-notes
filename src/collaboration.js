import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'

const colours = ['#C34A36', '#2F6B52', '#355C9A', '#8B5E34', '#6C4E8A']

export function createRoom(roomId, name, onState, { ownerToken = '', editorToken = '' } = {}) {
  const doc = new Y.Doc()
  const text = doc.getText('body')
  const meta = doc.getMap('meta')
  const awareness = new Awareness(doc)
  const clientId = crypto.randomUUID()
  const colour = colours[Math.abs(hash(name)) % colours.length]
  let socket
  let retry = 0
  let closed = false

  const emit = (state) => onState?.(state)
  const connect = () => {
    emit({ connection: retry ? 'reconnecting' : 'connecting', role: 'checking' })
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const configuredApi = import.meta.env.VITE_API_URL?.replace(/^http/, 'ws').replace(/\/$/, '')
    const base = configuredApi || `${protocol}//${location.host}`
    socket = new WebSocket(`${base}/ws?room=${encodeURIComponent(roomId)}&client=${clientId}&owner=${encodeURIComponent(ownerToken)}&edit=${encodeURIComponent(editorToken)}`)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      retry = 0
      emit({ connection: 'connected', saveState: 'saved' })
      socket.send(JSON.stringify({ type: 'presence', name, colour }))
      awareness.setLocalStateField('user', { name, color: colour })
    }
    socket.onmessage = ({ data }) => {
      if (typeof data === 'string') {
        const message = JSON.parse(data)
        if (message.type === 'presence') emit({ people: message.people })
        if (message.type === 'access') emit({ role: message.role, locked: message.locked, public: message.public, writeError: '' })
        if (message.type === 'saved') emit({ saveState: 'saved', savedAt: message.at, writeError: '' })
        if (message.type === 'save-error') emit({ saveState: 'error' })
        if (message.type === 'write-rejected') emit({ saveState: 'rejected', writeError: message.reason, role: message.role, locked: message.locked })
        if (message.type === 'awareness') applyAwarenessUpdate(awareness, new Uint8Array(message.update), 'remote')
      } else {
        Y.applyUpdate(doc, new Uint8Array(data), 'remote')
      }
    }
    socket.onclose = () => {
      if (closed) return
      emit({ connection: 'reconnecting' })
      window.setTimeout(connect, Math.min(1000 * 2 ** retry++, 12000))
    }
  }

  doc.on('update', (update, origin) => {
    if (origin !== 'remote' && socket?.readyState === WebSocket.OPEN) {
      emit({ saveState: 'saving' })
      socket.send(update)
    }
  })
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin === 'remote' || socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'awareness', update: Array.from(encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])) }))
  })
  connect()

  return {
    doc, text, meta, awareness, clientId,
    updateName(nextName) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'presence', name: nextName, colour }))
      awareness.setLocalStateField('user', { name: nextName, color: colour })
    },
    updateAccess(key, value) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'control', key, value }))
    },
    close() { closed = true; removeAwarenessStates(awareness, [doc.clientID], 'local'); awareness.destroy(); socket?.close(); doc.destroy() }
  }
}

export function applyTextChange(ytext, previous, next) {
  if (previous === next) return
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++
  let oldEnd = previous.length
  let newEnd = next.length
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd-- }
  ytext.doc.transact(() => {
    if (oldEnd > start) ytext.delete(start, oldEnd - start)
    if (newEnd > start) ytext.insert(start, next.slice(start, newEnd))
  }, 'local')
}

function hash(value) {
  let result = 0
  for (const char of value) result = ((result << 5) - result) + char.charCodeAt(0)
  return result
}
