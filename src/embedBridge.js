const PROTOCOL_VERSION = 1

export function createEmbedBridge({ roomId, configuredOrigins = '', getSnapshot, onFocus }) {
  const target = window.parent !== window ? window.parent : window.opener
  if (!target) return { notify() {}, dispose() {} }

  const allowedOrigins = parseAllowedOrigins(configuredOrigins, window.location.origin)
  const requestedOrigin = new URLSearchParams(window.location.search).get('hostOrigin')
  const referrerOrigin = safeOrigin(document.referrer)
  const targetOrigin = [requestedOrigin, referrerOrigin, window.location.origin].find(origin => allowedOrigins.has(origin))
  if (!targetOrigin) return { notify() {}, dispose() {} }

  const post = (type, payload = {}) => target.postMessage({ source: 'minute', version: PROTOCOL_VERSION, type, roomId, ...payload }, targetOrigin)
  const receive = async event => {
    if (event.source !== target || !allowedOrigins.has(event.origin)) return
    const message = event.data
    if (!message || message.source !== 'minute-host' || message.version !== PROTOCOL_VERSION || message.roomId !== roomId) return
    if (message.type === 'minute:focus') onFocus?.()
    if (message.type === 'minute:snapshot') {
      const snapshot = await getSnapshot?.()
      post('minute:snapshot-result', { requestId: String(message.requestId || '').slice(0, 100), snapshot })
    }
  }

  window.addEventListener('message', receive)
  post('minute:ready', { capabilities: ['focus', 'snapshot', 'state'] })
  return {
    notify(state) { post('minute:state', { state }) },
    dispose() { window.removeEventListener('message', receive) }
  }
}

export function parseAllowedOrigins(value, ownOrigin) {
  const origins = new Set([ownOrigin])
  for (const candidate of String(value || '').split(',')) {
    const origin = safeOrigin(candidate.trim())
    if (origin) origins.add(origin)
  }
  return origins
}

function safeOrigin(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null
  } catch { return null }
}
