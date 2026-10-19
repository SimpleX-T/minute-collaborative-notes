import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createRoom } from './collaboration'
import { createEmbedBridge } from './embedBridge'
import { exportDocument } from './exportDocument'
import { BookOpen, CheckSquare2, ChevronRight, Clock3, Code2, Download, Eye, FileText, Globe2, History, Link2, Lock, MessageSquareText, MonitorUp, Moon, MoreHorizontal, PanelLeft, Plus, Radio, RotateCcw, Save, Share2, Sparkles, Sun, Unlock, X } from 'lucide-react'

const CollaborativeEditor = lazy(() => import('./CollaborativeEditor').then(module => ({ default: module.CollaborativeEditor })))
const PastePage = lazy(() => import('./PastePage').then(module => ({ default: module.PastePage })))
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || ''
const EMBED_ORIGINS = import.meta.env.VITE_EMBED_ORIGINS || ''

export function App() {
  const [theme, toggleTheme] = useTheme()
  const roomId = location.pathname.match(/^\/(?:n|embed)\/([a-zA-Z0-9_-]+)$/)?.[1]
  const pasteId = location.pathname.match(/^\/p\/([a-zA-Z0-9_-]+)$/)?.[1]
  if (location.pathname === '/paste' || pasteId) return <Suspense fallback={<main className="room-loading"><Brand/><span>Opening the paste studio…</span></main>}><PastePage pasteId={pasteId} apiUrl={API_URL} theme={theme} onThemeToggle={toggleTheme} /></Suspense>
  return roomId
    ? <Note roomId={roomId} compact={location.pathname.startsWith('/embed/')} theme={theme} onThemeToggle={toggleTheme} />
    : <Home theme={theme} onThemeToggle={toggleTheme} />
}

function Home({ theme, onThemeToggle }) {
  const [creating, setCreating] = useState(false)
  const [publicPads, setPublicPads] = useState([])
  useEffect(() => { fetch(`${API_URL}/api/public`).then(response => response.ok ? response.json() : []).then(setPublicPads).catch(() => {}) }, [])
  const create = async () => {
    setCreating(true)
    try {
      location.assign(await createRoomUrl())
    } catch {
      setCreating(false)
      window.alert('Minute could not create the room. Check the connection and try again.')
    }
  }
  useEffect(() => {
    const handleShortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !creating) { event.preventDefault(); create() }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [creating])
  return <main className="home">
    <nav><Brand /><div className="home-nav-actions"><span className="quiet">No account. No setup.</span><ThemeToggle theme={theme} onToggle={onThemeToggle} /></div></nav>
    <section className="hero">
      <div className="eyebrow"><i /> For the meeting already in progress</div>
      <h1>Write once.<br/><em>Leave aligned.</em></h1>
      <p>One quiet page for notes, decisions, and next steps. Share the link and everyone is there—instantly.</p>
      <button className="primary" onClick={create} disabled={creating}>{creating ? 'Opening room…' : 'Start a shared note'} <Arrow /></button>
      <a className="paste-link" href="/paste"><Code2 /> Share a code paste</a>
      <span className="subnote">Private link · Live collaboration · Export anytime</span>
    </section>
    <aside className="preview" aria-label="Example collaborative note">
      <div className="preview-top"><span>Platform sync</span><div className="avatars"><b>J</b><b>M</b></div></div>
      <div className="preview-body">
        <small>MONDAY, 10:30</small><h2>Platform sync</h2>
        <h3>Decisions</h3><p>Ship the new billing flow behind a 10% flag.</p>
        <h3>Action items</h3><p><span className="check">✓</span> James to prepare migration plan</p>
        <div className="cursor">Maya is typing<span /></div>
      </div>
    </aside>
    <section className="public-pads" aria-labelledby="public-pads-title">
      <div className="public-heading"><div><span className="section-index">01</span><h2 id="public-pads-title">Public pads</h2></div><p>Open rooms shared by their authors.<br/>Join the thought in progress.</p></div>
      <div className="pad-list">
        {publicPads.length ? publicPads.map((pad, index) => <a href={`/n/${pad.id}`} className="pad-row" key={pad.id}>
          <span className="pad-number">{String(index + 1).padStart(2, '0')}</span>
          <span className="pad-copy"><strong>{pad.title}</strong><small>{pad.excerpt || 'A new conversation is starting.'}</small></span>
          <time>{relativeTime(pad.updatedAt)}</time><Arrow />
        </a>) : <div className="empty-pads"><span>No public notes yet.</span><p>The first open conversation could be yours.</p></div>}
      </div>
    </section>
    <footer><span>Made for conversations that become work.</span><span>⌘ Enter to create</span></footer>
  </main>
}

function Note({ roomId, compact = false, theme, onThemeToggle }) {
  const savedName = localStorage.getItem('minute:name') || `Guest ${Math.floor(Math.random() * 90 + 10)}`
  const [name, setName] = useState(savedName)
  const [title, setTitle] = useState('')
  const [connection, setConnection] = useState('connecting')
  const [saveState, setSaveState] = useState('saved')
  const [people, setPeople] = useState([])
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState('')
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versions, setVersions] = useState([])
  const [versionBusy, setVersionBusy] = useState('')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [toast, setToast] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [locked, setLocked] = useState(false)
  const [collaboration, setCollaboration] = useState(null)
  const [role, setRole] = useState('editor')
  const room = useRef(null)
  const floatingWindow = useRef(null)
  const editorRef = useRef(null)
  const embedBridge = useRef(null)
  const ownerToken = useMemo(() => new URLSearchParams(location.hash.slice(1)).get('owner'), [])
  const editorToken = useMemo(() => new URLSearchParams(location.hash.slice(1)).get('edit'), [])
  const isOwner = role === 'owner'
  const embedState = useRef({ title, locked, role })
  embedState.current = { title, locked, role }
  const colour = useMemo(() => ['#315ee7', '#e45c3f', '#24866f', '#8a55d6'][Math.abs(name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 4], [name])

  useEffect(() => {
    const collaboration = createRoom(roomId, name, state => {
      if (state.connection) setConnection(state.connection)
      if (state.saveState) setSaveState(state.saveState)
      if (state.people) setPeople(state.people)
      if (state.role) setRole(state.role)
      if (typeof state.locked === 'boolean') setLocked(state.locked)
      if (typeof state.public === 'boolean') setIsPublic(state.public)
    }, { ownerToken, editorToken })
    room.current = collaboration
    setCollaboration(collaboration)
    const update = () => {
      const nextTitle = collaboration.meta.get('title') || ''
      setTitle(nextTitle)
      setIsPublic(collaboration.meta.get('public') === true)
      setLocked(collaboration.meta.get('locked') === true)
    }
    collaboration.doc.on('update', update)
    return () => { floatingWindow.current?.close(); collaboration.doc.off('update', update); collaboration.close() }
  }, [roomId])

  useEffect(() => {
    if (!compact || !collaboration) return
    embedBridge.current = createEmbedBridge({
      roomId,
      configuredOrigins: EMBED_ORIGINS,
      onFocus: () => editorRef.current?.focus(),
      getSnapshot: async () => ({ ...embedState.current, markdown: await editorRef.current?.toMarkdown() || '' })
    })
    return () => { embedBridge.current?.dispose(); embedBridge.current = null }
  }, [compact, collaboration, roomId])

  useEffect(() => {
    embedBridge.current?.notify({ title, connection, saveState, locked, role, people: people.length })
  }, [title, connection, saveState, locked, role, people.length])

  useEffect(() => {
    const live = floatingWindow.current?.document.querySelector('.live')
    if (live) live.innerHTML = `<i></i> LIVE · ${people.length} HERE`
  }, [people])

  const changeTitle = event => {
    const next = event.target.value
    setTitle(next)
    room.current.meta.set('title', next)
  }
  const changeName = event => {
    const next = event.target.value.slice(0, 30)
    setName(next); localStorage.setItem('minute:name', next); room.current?.updateName(next)
  }
  const copyLink = async mode => {
    const token = mode === 'editor' ? editorToken : ''
    const value = `${location.origin}/n/${roomId}${token ? `#edit=${token}` : ''}`
    try {
      await copyText(value)
      setCopied(mode); window.setTimeout(() => setCopied(false), 1800)
    } catch { showToast('Copy failed. Select the address from your browser instead.') }
  }
  const download = async format => {
    setExporting(format)
    try {
      await exportDocument(format, {
        title,
        markdown: await editorRef.current?.toMarkdown() || '',
        html: await editorRef.current?.toHTML() || '',
        blocks: editorRef.current?.toJSON() || []
      })
      setExportOpen(false)
      showToast(`${format.toUpperCase()} downloaded.`)
    } catch (error) {
      console.error('Export failed', error)
      showToast(`${format.toUpperCase()} export failed. Try again.`)
    } finally { setExporting('') }
  }
  const floatNote = async () => {
    if (floatingWindow.current && !floatingWindow.current.closed) return floatingWindow.current.focus()
    const capability = ownerToken ? `owner=${ownerToken}${editorToken ? `&edit=${editorToken}` : ''}` : editorToken ? `edit=${editorToken}` : ''
    const embedUrl = `${location.origin}/embed/${roomId}${capability ? `#${capability}` : ''}`
    try {
      let target
      if (window.documentPictureInPicture) {
        target = await window.documentPictureInPicture.requestWindow({ width: 430, height: 620 })
        target.document.documentElement.style.cssText = 'width:100%;height:100%;margin:0;background:#fff'
        target.document.body.style.cssText = 'width:100%;height:100%;margin:0;overflow:hidden'
        target.document.title = `${title} — Minute`
        const frame = target.document.createElement('iframe')
        frame.src = embedUrl
        frame.title = 'Floating Minute note'
        frame.allow = 'clipboard-write'
        frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent'
        target.document.body.append(frame)
      } else {
        target = window.open(embedUrl, `minute-${roomId}`, 'popup,width=430,height=620')
      }
      if (!target) throw new Error('Popup blocked')
      floatingWindow.current = target
      target.addEventListener('pagehide', () => { if (floatingWindow.current === target) floatingWindow.current = null }, { once: true })
    } catch (error) {
      console.warn('Floating notes unavailable', error)
      showToast('Always-on-top is unavailable here. Open Reading view in a separate window instead.')
    }
  }
  const showToast = message => { setToast(message); window.setTimeout(() => setToast(''), 3200) }
  const createNewNote = async () => {
    try { location.assign(await createRoomUrl()) }
    catch { showToast('Minute could not create a new room. Check your connection.') }
  }
  const versionToken = ownerToken || editorToken
  const loadVersions = async () => {
    if (!versionToken) return showToast('Version history requires an editable link.')
    setVersionBusy('loading')
    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/versions`, { headers: { Authorization: `Bearer ${versionToken}` } })
      if (!response.ok) throw new Error('Version history unavailable')
      setVersions(await response.json())
      setVersionsOpen(true)
    } catch { showToast('Version history could not be loaded.') }
    finally { setVersionBusy('') }
  }
  const saveVersion = async (label = 'Manual checkpoint') => {
    if (!versionToken) return
    setVersionBusy('saving')
    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${versionToken}` }, body: JSON.stringify({ title, label, blocks: editorRef.current?.toJSON() || [] }) })
      if (!response.ok) throw new Error('Checkpoint failed')
      await loadVersions()
      showToast('Version checkpoint saved.')
    } catch { showToast('Version checkpoint could not be saved.') }
    finally { setVersionBusy('') }
  }
  const restoreVersion = async versionId => {
    if (!isOwner || !window.confirm('Restore this version? Minute will first save the current document as a safety checkpoint.')) return
    setVersionBusy(versionId)
    try {
      await saveVersion('Before version restore')
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/versions/${versionId}`, { headers: { Authorization: `Bearer ${ownerToken}` } })
      if (!response.ok) throw new Error('Restore failed')
      const version = await response.json()
      editorRef.current?.restore(version.blocks)
      setVersionsOpen(false)
      showToast('Version restored. Saving…')
    } catch { showToast('That version could not be restored.') }
    finally { setVersionBusy('') }
  }
  const togglePublic = () => {
    if (!isOwner) return
    if (!isPublic && !window.confirm('Publish this note? Anyone visiting Minute can discover and edit it.')) return
    room.current.updateAccess('public', !isPublic)
  }
  const toggleLock = () => {
    if (!isOwner) return
    room.current.updateAccess('locked', !locked)
  }

  if (!collaboration) return <main className="room-loading"><Brand /><span>Opening the room…</span></main>

  const canEdit = role !== 'viewer' && (!locked || isOwner)
  const blockEditor = <Suspense fallback={<div className="editor-skeleton"><span/><span/><span/></div>}><CollaborativeEditor ref={editorRef} room={collaboration} user={{ name, color: colour }} editable={canEdit} compact={compact} theme={theme} /></Suspense>

  if (compact) return <main className="embed-room"><header><Brand/><div className="embed-actions"><span className={`status ${connection} ${saveState}`}><i/>{role === 'viewer' ? 'View only' : locked ? 'Locked' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}</span><ThemeToggle theme={theme} onToggle={onThemeToggle} /></div></header><input className="embed-title" value={title} onChange={changeTitle} readOnly={!canEdit} placeholder="Untitled note"/>{blockEditor}</main>

  return <main className="workspace">
    <header className="toolbar">
      <div className="toolbar-start"><Brand /><span className="crumb-rule"/><span className="room-crumb">Meeting room</span></div>
      <div className={`status ${connection} ${saveState}`}><i />{connection !== 'connected' ? connection : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}</div>
      <div className="tools">
        <div className="presence">{people.slice(0, 3).map(person => <span key={person.id} style={{background: person.colour}} title={person.name}>{person.name?.[0]?.toUpperCase()}</span>)}{people.length > 3 && <small>+{people.length - 3}</small>}</div>
        <button className={`icon-action lock-action ${locked ? 'is-locked' : ''}`} onClick={toggleLock} disabled={!isOwner} title={isOwner ? (locked ? 'Unlock editing' : 'Lock editing') : 'Only the room owner can change the lock'}>{locked ? <Lock /> : <Unlock />} <span>{locked ? 'Locked' : 'Unlocked'}</span></button>
        <button className={`icon-action publish ${isPublic ? 'is-public' : ''}`} onClick={togglePublic} disabled={!isOwner} title={isOwner ? (isPublic ? 'Remove from Public Pads' : 'Publish to Public Pads') : 'Only the room owner can publish'}><Globe2 /> <span>{isPublic ? 'Public' : 'Publish'}</span></button>
        <button className="icon-action float" onClick={floatNote} title="Keep notes above your other windows"><MonitorUp /> <span>Float</span></button>
        <div className="export-control">
          <button className="icon-only" onClick={() => setExportOpen(value => !value)} title="Download note" aria-label="Download note" aria-expanded={exportOpen}><Download /></button>
          {exportOpen && <div className="export-menu" role="menu">
            <span>Download as</span>
            {[['markdown', 'Markdown', '.md'], ['pdf', 'PDF document', '.pdf'], ['docx', 'Word document', '.docx'], ['html', 'Web page', '.html'], ['text', 'Plain text', '.txt'], ['json', 'Block data', '.json']].map(([format, label, extension]) =>
              <button key={format} role="menuitem" onClick={() => download(format)} disabled={Boolean(exporting)}><strong>{exporting === format ? 'Preparing…' : label}</strong><small>{extension}</small></button>
            )}
          </div>}
        </div>
        <button className="icon-only" onClick={loadVersions} title="Version history" aria-label="Version history"><History /></button>
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        <button className="share" onClick={() => setShareOpen(true)}><Share2 />Share</button>
      </div>
    </header>
    <div className={`workspace-shell ${panelCollapsed ? 'panel-is-collapsed' : ''}`}>
      <aside className="note-rail">
        <button className="new-note" onClick={createNewNote}><Plus /> New note</button>
        <nav className="room-nav" aria-label="Room navigation">
          <button className="active"><FileText /><span>Meeting note</span><ChevronRight /></button>
          <button onClick={() => window.open(`/embed/${roomId}`, '_blank', 'noopener')}><Eye /><span>Reading view</span></button>
          <button onClick={togglePublic}><Globe2 /><span>{isPublic ? 'Unpublish note' : 'Publish note'}</span></button>
          <a href="/paste"><Code2 /><span>New code paste</span></a>
        </nav>
        <div className="rail-art"><img src="/assets/collaboration-still-life.png" alt="Abstract paper, pencil and glass composition"/><div><Sparkles/><span>Good meetings leave<br/>clear next steps.</span></div></div>
        <div className="identity"><span className="identity-avatar">{name[0]?.toUpperCase()}</span><div><label>You are</label><input value={name} onChange={changeName} aria-label="Your display name" /></div><MoreHorizontal /></div>
      </aside>
      <section className="paper-wrap">
        <div className="paper">
          <div className="meta"><span><Clock3 />{new Intl.DateTimeFormat('en', {weekday:'long', month:'long', day:'numeric'}).format(new Date())}</span><span><Radio /> Live room</span></div>
          <input className="title" value={title} onChange={changeTitle} readOnly={!canEdit} aria-label="Meeting title" placeholder="Untitled note" />
          {role === 'viewer' && <div className="locked-banner viewer-banner"><BookOpen /> You have view-only access. Ask the room owner for an editable link to contribute.</div>}
          {locked && !isOwner && <div className="locked-banner"><Lock /> This room is locked. You can read, copy, and export, but only the owner can edit.</div>}
          {blockEditor}
        </div>
      </section>
      <aside className="meeting-panel">
        <div className="panel-heading"><div><span>Room</span><h2>In this meeting</h2></div><button onClick={() => setPanelCollapsed(true)} aria-label="Collapse panel"><PanelLeft /></button></div>
        <div className="people-card">
          {people.map(person => <div className="person" key={person.id}><span style={{background:person.colour}}>{person.name?.[0]?.toUpperCase()}</span><div><strong>{person.name}</strong><small>{person.id === room.current?.clientId ? 'You · editing' : 'In the note'}</small></div><i /></div>)}
          <button onClick={() => setShareOpen(true)}><Plus /> Invite someone</button>
        </div>
        <div className="panel-section"><span className="panel-label">Meeting pulse</span><div className="pulse-row"><span className="pulse-icon coral"><MessageSquareText /></span><div><strong>Capture decisions</strong><small>Turn discussion into clarity.</small></div></div><div className="pulse-row"><span className="pulse-icon blue"><CheckSquare2 /></span><div><strong>Assign next steps</strong><small>Add an owner before leaving.</small></div></div></div>
        <div className="meeting-tip"><Sparkles/><p><strong>Small ritual, big payoff.</strong><br/>End with two minutes of silent review so everyone leaves aligned.</p></div>
      </aside>
      {panelCollapsed && <button className="panel-reopen" onClick={() => setPanelCollapsed(false)} aria-label="Open meeting panel"><PanelLeft /></button>}
    </div>
    {shareOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShareOpen(false) }}>
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <header><div><span>Access</span><h2 id="share-title">Share this note</h2></div><button onClick={() => setShareOpen(false)} aria-label="Close share dialog"><X /></button></header>
        <p>Choose whether collaborators can write with you or simply follow along.</p>
        <button className="share-option" onClick={() => copyLink('editor')} disabled={!editorToken}><span><Link2 /></span><div><strong>Editable link</strong><small>Anyone with this private link can contribute.</small></div><b>{copied === 'editor' ? 'Copied' : 'Copy'}</b></button>
        <button className="share-option" onClick={() => copyLink('viewer')}><span><BookOpen /></span><div><strong>View-only link</strong><small>People can read and export, but cannot edit.</small></div><b>{copied === 'viewer' ? 'Copied' : 'Copy'}</b></button>
        {!editorToken && <small className="legacy-note">This legacy room has no separate editor capability. Create a new room for editable links.</small>}
      </section>
    </div>}
    {versionsOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setVersionsOpen(false) }}>
      <section className="share-dialog versions-dialog" role="dialog" aria-modal="true" aria-labelledby="versions-title">
        <header><div><span>Document history</span><h2 id="versions-title">Versions</h2></div><button onClick={() => setVersionsOpen(false)} aria-label="Close version history"><X /></button></header>
        <p>Checkpoints preserve the full block structure. Restoring creates a new collaborative change, so nobody loses the current state.</p>
        <button className="save-version" onClick={() => saveVersion()} disabled={Boolean(versionBusy)}><Save />{versionBusy === 'saving' ? 'Saving checkpoint…' : 'Save current version'}</button>
        <div className="version-list">
          {versions.length ? versions.map(version => <div className="version-row" key={version.id}><div><strong>{version.label}</strong><small>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</small></div>{isOwner && <button onClick={() => restoreVersion(version.id)} disabled={Boolean(versionBusy)}><RotateCcw /> Restore</button>}</div>) : <div className="version-empty">No checkpoints yet. Save the first one above.</div>}
        </div>
      </section>
    </div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>
}

function Brand(){ return <a className="brand" href="/" aria-label="Minute home"><span>m</span> minute</a> }
function Arrow(){ return <svg viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4"/></svg> }

function ThemeToggle({ theme, onToggle }) {
  return <button className="theme-toggle" onClick={onToggle} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`}>
    <span>{theme === 'dark' ? <Sun /> : <Moon />}</span>
  </button>
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('minute:theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171717' : '#ffffff')
    localStorage.setItem('minute:theme', theme)
  }, [theme])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => setTheme(next))
    } else setTheme(next)
  }
  return [theme, toggle]
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

async function createRoomUrl() {
  const response = await fetch(`${API_URL}/api/rooms`, { method: 'POST' })
  if (!response.ok) throw new Error('Room creation failed')
  const { id, ownerToken, editorToken } = await response.json()
  return `/n/${id}#owner=${ownerToken}&edit=${editorToken}`
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const field = document.createElement('textarea')
  field.value = value
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('Copy unavailable')
}
