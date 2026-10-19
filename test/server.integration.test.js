import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import WebSocket from 'ws'
import * as Y from 'yjs'

const projectRoot = new URL('..', import.meta.url).pathname

async function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('server did not become healthy')
}

async function connect(baseUrl, room, query = '') {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/ws?room=${room.id}&client=${crypto.randomUUID()}${query}`)
  const doc = new Y.Doc()
  const messages = []
  socket.on('message', (data, binary) => {
    if (binary) Y.applyUpdate(doc, new Uint8Array(data), 'remote')
    else messages.push(JSON.parse(data.toString()))
  })
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  await new Promise(resolve => setTimeout(resolve, 40))
  return { socket, doc, messages }
}

async function waitFor(predicate, message, timeout = 2500) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(message)
}

test('server persists accepted changes and enforces capability roles', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'minute-server-test-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ALLOWED_ORIGINS: 'http://test.local' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise(resolve => child.once('exit', resolve))
    }
    await rm(dataDir, { recursive: true, force: true })
  })
  await waitForHealth(baseUrl, child)

  const roomResponse = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' })
  assert.equal(roomResponse.status, 201)
  const room = await roomResponse.json()
  const owner = await connect(baseUrl, room, `&owner=${room.ownerToken}`)
  const editor = await connect(baseUrl, room, `&edit=${room.editorToken}`)
  const viewer = await connect(baseUrl, room)
  t.after(() => { owner.socket.close(); editor.socket.close(); viewer.socket.close() })

  assert.equal(owner.messages.find(message => message.type === 'access')?.role, 'owner')
  assert.equal(editor.messages.find(message => message.type === 'access')?.role, 'editor')
  assert.equal(viewer.messages.find(message => message.type === 'access')?.role, 'viewer')

  owner.doc.getText('body').insert(0, 'durable change')
  owner.socket.send(Y.encodeStateAsUpdate(owner.doc))
  await waitFor(() => owner.messages.some(message => message.type === 'saved'), 'owner never received persisted-save acknowledgement')
  assert.ok((await readFile(join(dataDir, `${room.id}.bin`))).byteLength > 0)

  editor.doc.getText('body').insert(editor.doc.getText('body').length, ' + editor change')
  editor.socket.send(Y.encodeStateAsUpdate(editor.doc))
  await waitFor(() => editor.messages.some(message => message.type === 'saved'), 'editor never received persisted-save acknowledgement')
  await waitFor(() => owner.doc.getText('body').toString().includes('editor change'), 'owner never received editor change')

  const reloadedEditor = await connect(baseUrl, room, `&edit=${room.editorToken}`)
  t.after(() => reloadedEditor.socket.close())
  await waitFor(() => reloadedEditor.doc.getText('body').toString().includes('editor change'), 'editor change disappeared after reload')

  const forbidden = new Y.Doc()
  forbidden.getText('body').insert(0, 'viewer mutation')
  viewer.socket.send(Y.encodeStateAsUpdate(forbidden))
  await waitFor(() => viewer.messages.some(message => message.type === 'write-rejected'), 'viewer received no explicit write rejection')
  assert.equal(viewer.messages.some(message => message.type === 'saved'), false)
  assert.equal(owner.doc.getText('body').toString().includes('viewer mutation'), false)
  assert.equal(stderr, '')
})

test('paste and version APIs round-trip durable data', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'minute-api-test-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.js'], { cwd: projectRoot, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore' })
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise(resolve => child.once('exit', resolve))
    }
    await rm(dataDir, { recursive: true, force: true })
  })
  await waitForHealth(baseUrl, child)

  const pasteResponse = await fetch(`${baseUrl}/api/pastes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'const verified = true\n', language: 'javascript', expiresIn: 'hour' }) })
  assert.equal(pasteResponse.status, 201)
  const paste = await pasteResponse.json()
  assert.equal(await fetch(`${baseUrl}/api/pastes/${paste.id}/raw`).then(response => response.text()), 'const verified = true\n')

  const room = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' }).then(response => response.json())
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${room.ownerToken}` }
  const versionResponse = await fetch(`${baseUrl}/api/rooms/${room.id}/versions`, { method: 'POST', headers, body: JSON.stringify({ title: 'Test', label: 'Checkpoint', blocks: [{ id: 'a', type: 'paragraph', props: {}, content: [], children: [] }] }) })
  assert.equal(versionResponse.status, 201)
  const versions = await fetch(`${baseUrl}/api/rooms/${room.id}/versions`, { headers }).then(response => response.json())
  assert.equal(versions.length, 1)
  assert.equal(versions[0].label, 'Checkpoint')
})
