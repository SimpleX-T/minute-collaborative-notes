import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { ArrowLeft, Check, Clipboard, Code2, Eye, EyeOff, FileCode2, LockKeyhole, Moon, Share2, Sun, UnlockKeyhole } from 'lucide-react'

const languages = ['javascript', 'typescript', 'python', 'json', 'bash', 'sql', 'text']

export function PastePage({ pasteId, apiUrl, theme, onThemeToggle }) {
  const [content, setContent] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [expiresIn, setExpiresIn] = useState('week')
  const [paste, setPaste] = useState(null)
  const [state, setState] = useState(pasteId ? 'loading' : 'ready')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [protectedPaste, setProtectedPaste] = useState(false)
  const [password, setPassword] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')
  const [activePassword, setActivePassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const extensions = useMemo(() => language === 'python' ? [python()] : language === 'json' ? [json()] : ['javascript', 'typescript'].includes(language) ? [javascript({ typescript: language === 'typescript' })] : [], [language])

  const loadPaste = async (candidatePassword = '') => {
    setState(candidatePassword ? 'unlocking' : 'loading')
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/pastes/${pasteId}`, { headers: candidatePassword ? { 'X-Paste-Password': candidatePassword } : {} })
      const value = await response.json()
      if (response.status === 401 || response.status === 429) {
        setPaste(value)
        setLanguage(value.language || 'text')
        setError(candidatePassword ? value.error : '')
        setState('locked')
        return
      }
      if (!response.ok) throw new Error('Paste unavailable')
      setPaste(value)
      setContent(value.content)
      setLanguage(value.language)
      setActivePassword(candidatePassword)
      setState('ready')
    } catch { setState('missing') }
  }

  useEffect(() => { if (pasteId) loadPaste() }, [pasteId])

  const create = async () => {
    if (!content.trim()) return
    if (protectedPaste && password.length < 8) { setError('Use at least 8 characters for the password.'); return }
    setState('saving')
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/pastes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, language, expiresIn, password: protectedPaste ? password : '' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Paste failed')
      location.assign(`/p/${result.id}`)
    } catch (failure) {
      setError(failure.message || 'Could not publish. Check the connection and retry.')
      setState('error')
    }
  }
  const unlock = event => { event.preventDefault(); if (unlockPassword) loadPaste(unlockPassword) }
  const copyCode = async () => {
    await navigator.clipboard.writeText(content)
    setCopied('code'); window.setTimeout(() => setCopied(''), 1600)
  }
  const share = async () => {
    const url = `${location.origin}/p/${pasteId}`
    try {
      if (navigator.share) await navigator.share({ title: `${language} code paste`, text: 'Open this code paste in Minute.', url })
      else { await navigator.clipboard.writeText(url); setCopied('link'); window.setTimeout(() => setCopied(''), 1600) }
    } catch (failure) {
      if (failure.name !== 'AbortError') setError('Could not share this paste. Copy the address from your browser instead.')
    }
  }
  const openRaw = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/pastes/${pasteId}/raw`, { headers: activePassword ? { 'X-Paste-Password': activePassword } : {} })
      if (!response.ok) throw new Error()
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch { setError('The raw view could not be opened. Unlock the paste again and retry.') }
  }

  if (state === 'missing') return <main className="paste-page"><PasteNav theme={theme} onThemeToggle={onThemeToggle}/><section className="paste-missing"><Code2/><h1>This paste is gone.</h1><p>It expired, was removed, or the link is incomplete.</p><a href="/paste">Create a new paste</a></section></main>
  if (pasteId && state === 'loading') return <main className="paste-page"><PasteNav theme={theme} onThemeToggle={onThemeToggle}/><section className="paste-loading" aria-live="polite"><span/><p>Opening secure paste…</p></section></main>
  if (pasteId && ['locked', 'unlocking'].includes(state)) return <main className="paste-page"><PasteNav theme={theme} onThemeToggle={onThemeToggle}/><section className="paste-lock-shell"><div className="paste-lock-mark"><LockKeyhole/></div><span>Protected {paste?.language || 'code'} paste</span><h1>The code is locked.</h1><p>Enter the password shared by its author. It stays in this tab and is never added to the link.</p><form onSubmit={unlock}><label htmlFor="paste-password">Password</label><div className="password-field"><input id="paste-password" type={showPassword ? 'text' : 'password'} value={unlockPassword} onChange={event => setUnlockPassword(event.target.value)} autoFocus autoComplete="current-password" maxLength={128}/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff/> : <Eye/>}</button></div>{error && <div className="paste-form-error" role="alert">{error}</div>}<button className="paste-unlock" disabled={!unlockPassword || state === 'unlocking'}>{state === 'unlocking' ? 'Unlocking…' : <><UnlockKeyhole/> Unlock paste</>}</button></form><button className="paste-share-quiet" onClick={share}><Share2/> Share this locked paste</button></section></main>

  const readOnly = Boolean(pasteId)
  return <main className="paste-page">
    <PasteNav theme={theme} onThemeToggle={onThemeToggle}/>
    <section className="paste-shell">
      <header className="paste-header">
        <div><span>{readOnly ? (paste?.protected ? 'Unlocked code' : 'Shared code') : 'New code paste'}</span><h1>{readOnly ? `${language} paste` : 'Paste code. Send one clean link.'}</h1><p>{readOnly ? `Created ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(paste?.createdAt || Date.now()))}` : 'Syntax-aware, account-free, and built for the context that does not belong in chat.'}</p></div>
        <div className="paste-actions">{readOnly ? <><button onClick={share}>{copied === 'link' ? <Check/> : <Share2/>}{copied === 'link' ? 'Link copied' : 'Share'}</button><button onClick={copyCode}>{copied === 'code' ? <Check/> : <Clipboard/>}{copied === 'code' ? 'Copied' : 'Copy code'}</button><button onClick={openRaw}>Raw <FileCode2/></button></> : <button className="paste-publish" onClick={create} disabled={!content.trim() || state === 'saving'}>{state === 'saving' ? 'Publishing…' : 'Publish paste'}</button>}</div>
      </header>
      {!readOnly && <div className="paste-settings"><label>Language<select value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(value => <option key={value}>{value}</option>)}</select></label><label>Expires<select value={expiresIn} onChange={event => setExpiresIn(event.target.value)}><option value="hour">In 1 hour</option><option value="day">In 1 day</option><option value="week">In 1 week</option><option value="never">Never</option></select></label><button className={`paste-protection ${protectedPaste ? 'is-active' : ''}`} type="button" role="switch" aria-checked={protectedPaste} onClick={() => { setProtectedPaste(value => !value); setError('') }}><span><LockKeyhole/></span><div><strong>Password protection</strong><small>{protectedPaste ? 'Encrypted before it is stored' : 'Anyone with the link can read'}</small></div><i/></button>{protectedPaste && <label className="paste-password-setting">Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" maxLength={128}/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>}{error && <span className="paste-settings-error" role="alert">{error}</span>}</div>}
      {readOnly && error && <div className="paste-inline-error" role="alert">{error}</div>}
      <div className="code-surface"><CodeMirror value={content} onChange={setContent} editable={!readOnly} readOnly={readOnly} extensions={extensions} theme={theme === 'dark' ? oneDark : 'light'} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: !readOnly, autocompletion: !readOnly, bracketMatching: true }} height="min(68vh, 760px)" /></div>
    </section>
  </main>
}

function PasteNav({ theme, onThemeToggle }) {
  return <nav className="paste-nav"><a href="/" className="brand"><span>m</span> minute</a><div><a href="/"><ArrowLeft/> Notes</a><button className="theme-toggle" onClick={onThemeToggle} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun/> : <Moon/>}</button></div></nav>
}
