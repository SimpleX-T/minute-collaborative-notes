import { useEffect, useImperativeHandle, forwardRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { withCollaboration } from '@blocknote/core/yjs'
import { syntaxHighlighter } from '@blocknote/code-block'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

const initialMarkdown = `## Context
What are we here to align on?

## Notes
Start typing together…

## Decisions

## Action items
- [ ] Owner — next step`

export const CollaborativeEditor = forwardRef(function CollaborativeEditor({ room, user, editable, compact = false }, ref) {
  const fragment = room.doc.getXmlFragment('blocknote')
  const editor = useCreateBlockNote(withCollaboration({
    extensions: [syntaxHighlighter],
    collaboration: {
      fragment,
      provider: { awareness: room.awareness },
      user: { name: user.name, color: user.color },
      showCursorLabels: 'activity'
    }
  }), [room])

  useImperativeHandle(ref, () => ({
    editor,
    toMarkdown: () => editor.blocksToMarkdownLossy(editor.document),
    focus: () => editor.focus()
  }), [editor])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (room.meta.get('blocknoteSeeded')) return
      const blocks = editor.tryParseMarkdownToBlocks(room.text.toString() || initialMarkdown)
      editor.replaceBlocks(editor.document, blocks)
      room.meta.set('blocknoteSeeded', true)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [editor, room])

  const handleChange = () => {
    const markdown = editor.blocksToMarkdownLossy(editor.document)
    room.meta.set('excerpt', markdown.replace(/[#>*_`\-[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220))
  }

  return <BlockNoteView
    className={compact ? 'minute-blocknote minute-blocknote--compact' : 'minute-blocknote'}
    editor={editor}
    editable={editable}
    onChange={handleChange}
    theme="light"
    data-testid="blocknote-editor"
  />
})
