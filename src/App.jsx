import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createRoom } from './collaboration'
import { createEmbedBridge } from './embedBridge'
import { BookOpen, CheckSquare2, ChevronRight, Clock3, Download, Eye, FileText, Globe2, Link2, Lock, MessageSquareText, MonitorUp, MoreHorizontal, PanelLeft, Plus, Radio, Share2, Sparkles, Unlock, X } from 'lucide-react'

const CollaborativeEditor = lazy(() => import('./CollaborativeEditor').then(module => ({ default: module.CollaborativeEditor })))
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || ''
const EMBED_ORIGINS = import.meta.env.VITE_EMBED_ORIGINS || ''

export function App() {
  const roomId = location.pathname.match(/^\/(?:n|embed)\/([a-zA-Z0-9_-]+)$/)?.[1]
  return roomId ? <Note roomId={roomId} compact={location.pathname.startsWith('/embed/')} /> : <Home />
}

function Home() {
  const [creating, setCreating] = useState(false)
  const [publicPads, setPublicPads] = useState([])
  useEffect(() => { fetch(`${API_URL}/api/public`).then(response => response.ok ? response.json() : []).then(setPublicPads).catch(() => {}) }, [])
  const create = async () => {
    setCreating(true)
    try {
      const response = await fetch(`${API_URL}/api/rooms`, { method: 'POST' })
      if (!response.ok) throw new Error('Room creation failed')
      const { id, ownerToken, editorToken } = await response.json()
      location.assign(`/n/${id}#owner=${ownerToken}&edit=${editorToken}`)
    } catch {
      setCreating(false)
      window.alert('Minute could not create the room. Check the connection and try again.')
    }
  }
  return <main className="home">
    <nav><Brand /><span className="quiet">No account. No setup.</span></nav>
    <section className="hero">
      <div className="eyebrow"><i /> For the meeting already in progress</div>
      <h1>Write once.<br/><em>Leave aligned.</em></h1>
      <p>One quiet page for notes, decisions, and next steps. Share the link and everyone is there—instantly.</p>
      <button className="primary" onClick={create} disabled={creating}>{creating ? 'Opening room…' : 'Start a shared note'} <Arrow /></button>
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

function Note({ roomId, compact = false }) {
  const savedName = localStorage.getItem('minute:name') || `Guest ${Math.floor(Math.random() * 90 + 10)}`
  const [name, setName] = useState(savedName)
  const [title, setTitle] = useState('Untitled meeting')
  const [connection, setConnection] = useState('connecting')
  const [people, setPeople] = useState([])
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
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
      if (state.people) setPeople(state.people)
      if (state.role) setRole(state.role)
      if (typeof state.locked === 'boolean') setLocked(state.locked)
      if (typeof state.public === 'boolean') setIsPublic(state.public)
    }, { ownerToken, editorToken })
    room.current = collaboration
    setCollaboration(collaboration)
    const update = () => {
      const nextTitle = collaboration.meta.get('title') || 'Untitled meeting'
      setTitle(nextTitle)
      setIsPublic(collaboration.meta.get('public') === true)
      setLocked(collaboration.meta.get('locked') === true)
    }
    collaboration.doc.on('update', update)
    window.setTimeout(() => {
      if (!collaboration.meta.has('title')) collaboration.meta.set('title', 'Weekly engineering sync')
    }, 250)
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
    embedBridge.current?.notify({ title, connection, locked, role, people: people.length })
  }, [title, connection, locked, role, people.length])

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
    await navigator.clipboard.writeText(`${location.origin}/n/${roomId}${token ? `#edit=${token}` : ''}`)
    setCopied(mode); window.setTimeout(() => setCopied(false), 1800)
  }
  const download = () => {
    const markdown = editorRef.current?.toMarkdown() || ''
    const blob = new Blob([`# ${title}\n\n${markdown}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'meeting'}.md`; link.click(); URL.revokeObjectURL(url)
  }
  const floatNote = async () => {
    if (floatingWindow.current && !floatingWindow.current.closed) return floatingWindow.current.focus()
    try {
      const target = window.documentPictureInPicture
        ? await window.documentPictureInPicture.requestWindow({ width: 430, height: 620 })
        : window.open('', `minute-${roomId}`, 'popup,width=430,height=620')
      if (!target) return
      floatingWindow.current = target
      const capability = ownerToken ? `owner=${ownerToken}${editorToken ? `&edit=${editorToken}` : ''}` : editorToken ? `edit=${editorToken}` : ''
      target.location.href = `${location.origin}/embed/${roomId}${capability ? `#${capability}` : ''}`
      target.addEventListener('pagehide', () => { if (floatingWindow.current === target) floatingWindow.current = null }, { once: true })
    } catch (error) { console.warn('Floating notes unavailable', error) }
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
  const blockEditor = <Suspense fallback={<div className="editor-skeleton"><span/><span/><span/></div>}><CollaborativeEditor ref={editorRef} room={collaboration} user={{ name, color: colour }} editable={canEdit} compact={compact} /></Suspense>

  if (compact) return <main className="embed-room"><header><Brand/><span className={`status ${connection}`}><i/>{role === 'viewer' ? 'View only' : locked ? 'Locked' : 'Live'}</span></header><input className="embed-title" value={title} onChange={changeTitle} readOnly={!canEdit}/>{blockEditor}</main>

  return <main className="workspace">
    <header className="toolbar">
      <div className="toolbar-start"><Brand /><span className="crumb-rule"/><span className="room-crumb">Meeting room</span></div>
      <div className={`status ${connection}`}><i />{connection === 'connected' ? 'Saved live' : connection}</div>
      <div className="tools">
        <div className="presence">{people.slice(0, 3).map(person => <span key={person.id} style={{background: person.colour}} title={person.name}>{person.name?.[0]?.toUpperCase()}</span>)}{people.length > 3 && <small>+{people.length - 3}</small>}</div>
        <button className={`icon-action lock-action ${locked ? 'is-locked' : ''}`} onClick={toggleLock} disabled={!isOwner} title={isOwner ? (locked ? 'Unlock editing' : 'Lock editing') : 'Only the room owner can change the lock'}>{locked ? <Lock /> : <Unlock />} <span>{locked ? 'Locked' : 'Unlocked'}</span></button>
        <button className={`icon-action publish ${isPublic ? 'is-public' : ''}`} onClick={togglePublic} disabled={!isOwner} title={isOwner ? (isPublic ? 'Remove from Public Pads' : 'Publish to Public Pads') : 'Only the room owner can publish'}><Globe2 /> <span>{isPublic ? 'Public' : 'Publish'}</span></button>
        <button className="icon-action float" onClick={floatNote} title="Keep notes above your other windows"><MonitorUp /> <span>Float</span></button>
        <button className="icon-only" onClick={download} title="Export Markdown" aria-label="Export Markdown"><Download /></button>
        <button className="share" onClick={() => setShareOpen(true)}><Share2 />Share</button>
      </div>
    </header>
    <div className="workspace-shell">
      <aside className="note-rail">
        <button className="new-note" onClick={() => location.assign('/')}><Plus /> New note</button>
        <nav className="room-nav" aria-label="Room navigation">
          <button className="active"><FileText /><span>Meeting note</span><ChevronRight /></button>
          <button onClick={() => window.open(`/embed/${roomId}`, '_blank', 'noopener')}><Eye /><span>Reading view</span></button>
          <button onClick={togglePublic}><Globe2 /><span>Public pads</span></button>
        </nav>
        <div className="rail-art"><img src="/assets/collaboration-still-life.png" alt="Abstract paper, pencil and glass composition"/><div><Sparkles/><span>Good meetings leave<br/>clear next steps.</span></div></div>
        <div className="identity"><span className="identity-avatar">{name[0]?.toUpperCase()}</span><div><label>You are</label><input value={name} onChange={changeName} aria-label="Your display name" /></div><MoreHorizontal /></div>
      </aside>
      <section className="paper-wrap">
        <div className="paper">
          <div className="meta"><span><Clock3 />{new Intl.DateTimeFormat('en', {weekday:'long', month:'long', day:'numeric'}).format(new Date())}</span><span><Radio /> Live room</span></div>
          <input className="title" value={title} onChange={changeTitle} readOnly={!canEdit} aria-label="Meeting title" />
          {role === 'viewer' && <div className="locked-banner viewer-banner"><BookOpen /> You have view-only access. Ask the room owner for an editable link to contribute.</div>}
          {locked && !isOwner && <div className="locked-banner"><Lock /> This room is locked. You can read, copy, and export, but only the owner can edit.</div>}
          {blockEditor}
        </div>
      </section>
      <aside className="meeting-panel">
        <div className="panel-heading"><div><span>Room</span><h2>In this meeting</h2></div><button aria-label="Collapse panel"><PanelLeft /></button></div>
        <div className="people-card">
          {people.map(person => <div className="person" key={person.id}><span style={{background:person.colour}}>{person.name?.[0]?.toUpperCase()}</span><div><strong>{person.name}</strong><small>{person.id === room.current?.clientId ? 'You · editing' : 'In the note'}</small></div><i /></div>)}
          <button onClick={() => setShareOpen(true)}><Plus /> Invite someone</button>
        </div>
        <div className="panel-section"><span className="panel-label">Meeting pulse</span><div className="pulse-row"><span className="pulse-icon coral"><MessageSquareText /></span><div><strong>Capture decisions</strong><small>Turn discussion into clarity.</small></div></div><div className="pulse-row"><span className="pulse-icon blue"><CheckSquare2 /></span><div><strong>Assign next steps</strong><small>Add an owner before leaving.</small></div></div></div>
        <div className="meeting-tip"><Sparkles/><p><strong>Small ritual, big payoff.</strong><br/>End with two minutes of silent review so everyone leaves aligned.</p></div>
      </aside>
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
  </main>
}

function Brand(){ return <a className="brand" href="/" aria-label="Minute home"><span>m</span> minute</a> }
function Arrow(){ return <svg viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4"/></svg> }

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}
