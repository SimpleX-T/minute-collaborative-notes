import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { ArrowLeft, Check, Clipboard, Code2, ExternalLink, Moon, Sun } from 'lucide-react'

const languages = ['javascript', 'typescript', 'python', 'json', 'bash', 'sql', 'text']

export function PastePage({ pasteId, apiUrl, theme, onThemeToggle }) {
  const [content, setContent] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [expiresIn, setExpiresIn] = useState('week')
  const [paste, setPaste] = useState(null)
  const [state, setState] = useState(pasteId ? 'loading' : 'ready')
  const [copied, setCopied] = useState(false)
  const extensions = useMemo(() => language === 'python' ? [python()] : language === 'json' ? [json()] : ['javascript', 'typescript'].includes(language) ? [javascript({ typescript: language === 'typescript' })] : [], [language])

  useEffect(() => {
    if (!pasteId) return
    fetch(`${apiUrl}/api/pastes/${pasteId}`).then(async response => {
      if (!response.ok) throw new Error('Paste unavailable')
      return response.json()
    }).then(value => { setPaste(value); setContent(value.content); setLanguage(value.language); setState('ready') }).catch(() => setState('missing'))
  }, [pasteId])

  const create = async () => {
    if (!content.trim()) return
    setState('saving')
    try {
      const response = await fetch(`${apiUrl}/api/pastes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, language, expiresIn }) })
      if (!response.ok) throw new Error('Paste failed')
      const { id } = await response.json()
      location.assign(`/p/${id}`)
    } catch { setState('error') }
  }
  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true); window.setTimeout(() => setCopied(false), 1600)
  }

  if (state === 'missing') return <main className="paste-page"><PasteNav theme={theme} onThemeToggle={onThemeToggle}/><section className="paste-missing"><Code2/><h1>This paste is gone.</h1><p>It expired, was removed, or the link is incomplete.</p><a href="/paste">Create a new paste</a></section></main>

  const readOnly = Boolean(pasteId)
  return <main className="paste-page">
    <PasteNav theme={theme} onThemeToggle={onThemeToggle}/>
    <section className="paste-shell">
      <header className="paste-header">
        <div><span>{readOnly ? 'Shared code' : 'New code paste'}</span><h1>{readOnly ? `${language} paste` : 'Paste code. Send one clean link.'}</h1><p>{readOnly ? `Created ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(paste?.createdAt || Date.now()))}` : 'Syntax-aware, account-free, and built for the context that does not belong in chat.'}</p></div>
        <div className="paste-actions">
          {readOnly ? <><button onClick={copy}>{copied ? <Check/> : <Clipboard/>}{copied ? 'Copied' : 'Copy code'}</button><a href={`${apiUrl}/api/pastes/${pasteId}/raw`} target="_blank" rel="noreferrer">Raw <ExternalLink/></a></> : <button className="paste-publish" onClick={create} disabled={!content.trim() || state === 'saving'}>{state === 'saving' ? 'Publishing…' : 'Publish paste'}</button>}
        </div>
      </header>
      {!readOnly && <div className="paste-settings"><label>Language<select value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(value => <option key={value}>{value}</option>)}</select></label><label>Expires<select value={expiresIn} onChange={event => setExpiresIn(event.target.value)}><option value="hour">In 1 hour</option><option value="day">In 1 day</option><option value="week">In 1 week</option><option value="never">Never</option></select></label>{state === 'error' && <span>Could not publish. Check the connection and retry.</span>}</div>}
      <div className="code-surface"><CodeMirror value={content} onChange={setContent} editable={!readOnly} readOnly={readOnly} extensions={extensions} theme={theme === 'dark' ? oneDark : 'light'} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: !readOnly, autocompletion: !readOnly, bracketMatching: true }} height="min(68vh, 760px)" /></div>
    </section>
  </main>
}

function PasteNav({ theme, onThemeToggle }) {
  return <nav className="paste-nav"><a href="/" className="brand"><span>m</span> minute</a><div><a href="/"><ArrowLeft/> Notes</a><button className="theme-toggle" onClick={onThemeToggle} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun/> : <Moon/>}</button></div></nav>
}
