import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import * as Y from 'yjs'
import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT || 8787)
const DATA_DIR = resolve(process.env.DATA_DIR || './data')
const PASTE_DIR = join(DATA_DIR, 'pastes')
const MAX_MESSAGE = 1_000_000
const ROOM_CREATE_WINDOW = 60_000
const ROOM_CREATE_LIMIT = 20
const rooms = new Map()
const loadingRooms = new Map()
const creationWindows = new Map()
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean))
const allowedEmbedOrigins = (process.env.ALLOWED_EMBED_ORIGINS || '').split(',').map(value => value.trim()).filter(value => /^https:\/\/[a-z0-9.*-]+(?::\d+)?$/i.test(value))
await mkdir(DATA_DIR, { recursive: true })
await mkdir(PASTE_DIR, { recursive: true })
const PUBLIC_INDEX_PATH = join(DATA_DIR, 'public-index.json')
let publicPads = new Map()
try {
  const entries = JSON.parse(await readFile(PUBLIC_INDEX_PATH, 'utf8'))
  publicPads = new Map(entries.map(entry => [entry.id, entry]))
} catch (error) { if (error.code !== 'ENOENT') console.error('public index load failed', error) }

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use((request, response, next) => {
  const origin = request.headers.origin
  if (origin && (allowedOrigins.size === 0 || allowedOrigins.has(origin))) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.path.startsWith('/embed/')) response.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${allowedEmbedOrigins.join(' ')}`.trim())
  else response.setHeader('X-Frame-Options', 'SAMEORIGIN')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }))
app.post('/api/rooms', async (request, response) => {
  if (!allowRoomCreation(request.ip || request.socket.remoteAddress || 'unknown')) {
    response.set('Retry-After', '60')
    return response.status(429).json({ error: 'Too many rooms created. Try again in a minute.' })
  }
  const id = randomBytes(10).toString('base64url')
  const ownerToken = randomBytes(24).toString('base64url')
  const editorToken = randomBytes(24).toString('base64url')
  const room = await getRoom(id)
  room.access.ownerTokenHash = digest(ownerToken)
  room.access.editorTokenHash = digest(editorToken)
  await Promise.all([persist(room), persistAccess(room)])
  response.status(201).json({ id, ownerToken, editorToken })
})
app.get('/api/public', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  res.json([...publicPads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50))
})
app.post('/api/pastes', async (request, response) => {
  if (!allowRoomCreation(`paste:${request.ip || request.socket.remoteAddress || 'unknown'}`)) return response.status(429).json({ error: 'Too many pastes. Try again in a minute.' })
  const content = String(request.body?.content || '')
  if (!content.trim() || Buffer.byteLength(content) > MAX_MESSAGE) return response.status(400).json({ error: 'Paste content must be between 1 byte and 1 MB.' })
  const language = String(request.body?.language || 'text').replace(/[^a-z0-9+#-]/gi, '').slice(0, 30) || 'text'
  const expiry = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[request.body?.expiresIn] || null
  const id = randomBytes(7).toString('base64url')
  const paste = { id, content, language, createdAt: new Date().toISOString(), expiresAt: expiry ? new Date(Date.now() + expiry).toISOString() : null }
  await atomicJsonWrite(join(PASTE_DIR, `${id}.json`), paste)
  response.status(201).json({ id })
})
app.get('/api/pastes/:id', async (request, response) => {
  const paste = await readPaste(request.params.id)
  if (!paste) return response.status(404).json({ error: 'Paste not found or expired.' })
  response.set('Cache-Control', 'public, max-age=30')
  response.json(paste)
})
app.get('/api/pastes/:id/raw', async (request, response) => {
  const paste = await readPaste(request.params.id)
  if (!paste) return response.status(404).type('text').send('Paste not found or expired.')
  response.set('Cache-Control', 'public, max-age=30')
  response.type('text/plain').send(paste.content)
})
app.get('/api/rooms/:id/versions', async (request, response) => {
  const room = await authorizedRoom(request, response, ['owner', 'editor'])
  if (!room) return
  const versions = await readVersions(room)
  response.json(versions.map(({ blocks, ...summary }) => summary))
})
app.post('/api/rooms/:id/versions', async (request, response) => {
  const room = await authorizedRoom(request, response, ['owner', 'editor'])
  if (!room) return
  if (!Array.isArray(request.body?.blocks)) return response.status(400).json({ error: 'A BlockNote block array is required.' })
  const encoded = JSON.stringify(request.body.blocks)
  if (Buffer.byteLength(encoded) > MAX_MESSAGE) return response.status(413).json({ error: 'This version is too large.' })
  const versions = await readVersions(room)
  const version = { id: randomBytes(7).toString('base64url'), label: String(request.body.label || 'Checkpoint').slice(0, 80), title: String(request.body.title || 'Untitled meeting').slice(0, 100), createdAt: new Date().toISOString(), blocks: request.body.blocks }
  versions.unshift(version)
  await atomicJsonWrite(room.versionsPath, versions.slice(0, 50))
  response.status(201).json({ id: version.id, createdAt: version.createdAt })
})
app.get('/api/rooms/:id/versions/:versionId', async (request, response) => {
  const room = await authorizedRoom(request, response, ['owner'])
  if (!room) return
  const version = (await readVersions(room)).find(item => item.id === request.params.versionId)
  if (!version) return response.status(404).json({ error: 'Version not found.' })
  response.json(version)
})
if (existsSync('dist')) {
  app.use(express.static('dist', { maxAge: '1h', etag: true }))
  app.get(/.*/, (_req, res) => res.sendFile(resolve('dist/index.html')))
}
const server = createServer(app)
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE })

server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const roomId = url.searchParams.get('room')
  const origin = request.headers.origin
  if (origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) return socket.destroy()
  if (url.pathname !== '/ws' || !roomId || !/^[a-zA-Z0-9_-]{6,64}$/.test(roomId)) return socket.destroy()
  const room = await getRoom(roomId)
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, room, url.searchParams.get('client'), url.searchParams.get('owner'), url.searchParams.get('edit')))
})

wss.on('connection', (ws, room, clientId, ownerToken, editorToken) => {
  const id = clientId?.slice(0, 80) || crypto.randomUUID()
  const isOwner = Boolean(ownerToken && digest(ownerToken) === room.access.ownerTokenHash)
  const isEditor = isOwner || !room.access.editorTokenHash || Boolean(editorToken && digest(editorToken) === room.access.editorTokenHash)
  const role = isOwner ? 'owner' : isEditor ? 'editor' : 'viewer'
  room.clients.set(id, { ws, id, name: 'Guest', colour: '#555', isOwner, role })
  ws.send(Y.encodeStateAsUpdate(room.doc))
  ws.send(JSON.stringify({ type: 'access', role, locked: room.access.locked, public: room.access.public }))
  broadcastPresence(room)
  ws.on('message', (data, binary) => {
    if (binary) {
      try {
        if (!isEditor || (room.access.locked && !isOwner)) return
        const stateVector = Y.encodeStateVector(room.doc)
        const update = new Uint8Array(data)
        Y.applyUpdate(room.doc, update, ws)
        enforceAuthoritativeMeta(room)
        const acceptedUpdate = Y.encodeStateAsUpdate(room.doc, stateVector)
        for (const client of room.clients.values()) {
          if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) client.ws.send(acceptedUpdate)
        }
      } catch { ws.close(1003, 'Invalid update') }
      return
    }
    try {
      const message = JSON.parse(data.toString())
      if (message.type === 'presence') {
        const client = room.clients.get(id)
        client.name = String(message.name || 'Guest').slice(0, 30)
        client.colour = /^#[0-9a-f]{6}$/i.test(message.colour) ? message.colour : '#555555'
        broadcastPresence(room)
      } else if (message.type === 'awareness' && Array.isArray(message.update) && message.update.length <= 100_000) {
        const payload = JSON.stringify({ type: 'awareness', update: message.update })
        for (const client of room.clients.values()) if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) client.ws.send(payload)
      } else if (message.type === 'control' && isOwner && ['locked', 'public'].includes(message.key) && typeof message.value === 'boolean') {
        updateRoomControl(room, message.key, message.value)
      }
    } catch { ws.close(1003, 'Invalid message') }
  })
  ws.on('close', () => { room.clients.delete(id); broadcastPresence(room); scheduleRoomCleanup(room) })
})

async function getRoom(id) {
  if (rooms.has(id)) return rooms.get(id)
  if (loadingRooms.has(id)) return loadingRooms.get(id)
  const loading = loadRoom(id)
  loadingRooms.set(id, loading)
  try { return await loading } finally { loadingRooms.delete(id) }
}

async function loadRoom(id) {
  const doc = new Y.Doc()
  const path = join(DATA_DIR, `${id}.bin`)
  const accessPath = join(DATA_DIR, `${id}.access.json`)
  try { Y.applyUpdate(doc, new Uint8Array(await readFile(path)), 'disk') } catch (error) { if (error.code !== 'ENOENT') console.error('load failed', id, error) }
  let access = { ownerTokenHash: '', editorTokenHash: '', locked: false, public: false }
  let accessLoaded = false
  try { access = { ...access, ...JSON.parse(await readFile(accessPath, 'utf8')) }; accessLoaded = true } catch (error) { if (error.code !== 'ENOENT') console.error('access load failed', id, error) }
  const meta = doc.getMap('meta')
  if (!access.ownerTokenHash && meta.get('ownerTokenHash')) access.ownerTokenHash = String(meta.get('ownerTokenHash'))
  if (!accessLoaded) {
    access.locked = meta.get('locked') === true
    access.public = meta.get('public') === true
  }
  meta.delete('ownerTokenHash')
  const room = { id, doc, path, accessPath, versionsPath: join(DATA_DIR, `${id}.versions.json`), access, clients: new Map(), saveTimer: null, saveRevision: 0, persistChain: Promise.resolve(), accessTimer: null, publicTimer: null, cleanupTimer: null }
  enforceAuthoritativeMeta(room)
  doc.on('update', (update, origin) => {
    clearTimeout(room.saveTimer)
    const revision = ++room.saveRevision
    room.saveTimer = setTimeout(() => persist(room).then(() => {
      if (revision === room.saveRevision) broadcast(room, JSON.stringify({ type: 'saved', at: new Date().toISOString(), revision }))
    }).catch(error => {
      console.error('save failed', room.id, error)
      broadcast(room, JSON.stringify({ type: 'save-error' }))
    }), 750)
    clearTimeout(room.publicTimer)
    room.publicTimer = setTimeout(() => updatePublicIndex(room), 900)
  })
  rooms.set(id, room)
  if (!accessLoaded) await Promise.all([persist(room), persistAccess(room)])
  return room
}

function broadcastPresence(room) {
  const payload = JSON.stringify({ type: 'presence', people: [...room.clients.values()].map(({ id, name, colour }) => ({ id, name, colour })) })
  for (const { ws } of room.clients.values()) if (ws.readyState === WebSocket.OPEN) ws.send(payload)
}
async function persist(room) {
  const run = async () => {
    const temporaryPath = `${room.path}.tmp`
    await writeFile(temporaryPath, Y.encodeStateAsUpdate(room.doc))
    await rename(temporaryPath, room.path)
  }
  room.persistChain = room.persistChain.then(run, run)
  return room.persistChain
}
async function persistAccess(room) {
  await atomicJsonWrite(room.accessPath, room.access)
}
async function atomicJsonWrite(path, value) {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value))
  await rename(temporaryPath, path)
}
async function readPaste(id) {
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(id)) return null
  try {
    const paste = JSON.parse(await readFile(join(PASTE_DIR, `${id}.json`), 'utf8'))
    if (paste.expiresAt && Date.parse(paste.expiresAt) <= Date.now()) return null
    return paste
  } catch (error) { if (error.code !== 'ENOENT') console.error('paste load failed', id, error); return null }
}
async function readVersions(room) {
  try { return JSON.parse(await readFile(room.versionsPath, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') console.error('version load failed', room.id, error); return [] }
}
async function authorizedRoom(request, response, roles) {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(request.params.id)) { response.status(404).json({ error: 'Room not found.' }); return null }
  const room = await getRoom(request.params.id)
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const role = token && digest(token) === room.access.ownerTokenHash ? 'owner' : token && digest(token) === room.access.editorTokenHash ? 'editor' : 'viewer'
  if (!roles.includes(role)) { response.status(403).json({ error: 'This capability cannot access version history.' }); return null }
  return room
}
async function updatePublicIndex(room) {
  const meta = room.doc.getMap('meta')
  if (meta.get('public') === true) {
    const plain = String(meta.get('excerpt') || room.doc.getText('body').toString()).replace(/[#>*_`\-[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    publicPads.set(room.id, {
      id: room.id,
      title: String(meta.get('title') || 'Untitled meeting').slice(0, 100),
      excerpt: plain.slice(0, 150),
      updatedAt: new Date().toISOString()
    })
  } else publicPads.delete(room.id)
  await writeFile(PUBLIC_INDEX_PATH, JSON.stringify([...publicPads.values()]))
}
function scheduleRoomCleanup(room) {
  clearTimeout(room.cleanupTimer)
  room.cleanupTimer = setTimeout(async () => { if (!room.clients.size) { await persist(room); room.doc.destroy(); rooms.delete(room.id) } }, 60_000)
}

function broadcast(room, payload) {
  for (const { ws } of room.clients.values()) if (ws.readyState === WebSocket.OPEN) ws.send(payload)
}

function enforceAuthoritativeMeta(room) {
  const meta = room.doc.getMap('meta')
  if (meta.get('locked') !== room.access.locked) meta.set('locked', room.access.locked)
  if (meta.get('public') !== room.access.public) meta.set('public', room.access.public)
  if (meta.has('ownerTokenHash')) meta.delete('ownerTokenHash')
}

function updateRoomControl(room, key, value) {
  room.access[key] = value
  const stateVector = Y.encodeStateVector(room.doc)
  enforceAuthoritativeMeta(room)
  const update = Y.encodeStateAsUpdate(room.doc, stateVector)
  for (const { ws } of room.clients.values()) if (ws.readyState === WebSocket.OPEN) ws.send(update)
  clearTimeout(room.accessTimer)
  room.accessTimer = setTimeout(() => persistAccess(room).catch(error => console.error('access save failed', room.id, error)), 100)
}

function allowRoomCreation(key) {
  const now = Date.now()
  const recent = (creationWindows.get(key) || []).filter(timestamp => now - timestamp < ROOM_CREATE_WINDOW)
  if (recent.length >= ROOM_CREATE_LIMIT) return false
  recent.push(now)
  creationWindows.set(key, recent)
  return true
}

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) ws.ping()
}, 30_000)
server.on('close', () => clearInterval(heartbeat))
server.listen(PORT, () => console.log(`Minute listening on http://localhost:${PORT}`))

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Minute received ${signal}; flushing ${rooms.size} room(s) before shutdown`)
  clearInterval(heartbeat)
  server.close()
  await Promise.allSettled([...rooms.values()].flatMap(room => [persist(room), persistAccess(room)]))
  process.exit(0)
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}
