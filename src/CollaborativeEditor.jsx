import { useEffect, useImperativeHandle, forwardRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { withCollaboration } from '@blocknote/core/yjs'
import { syntaxHighlighter } from '@blocknote/code-block'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

export const CollaborativeEditor = forwardRef(function CollaborativeEditor({ room, user, editable, compact = false, theme = 'light' }, ref) {
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
    toHTML: () => editor.blocksToFullHTML(editor.document),
    toJSON: () => editor.document,
    restore: blocks => editor.replaceBlocks(editor.document, blocks),
    focus: () => editor.focus()
  }), [editor])

  useEffect(() => {
    if (!editable) return
    const timer = window.setTimeout(() => {
      if (room.meta.get('blocknoteSeeded')) return
      const legacyMarkdown = room.text.toString().trim()
      if (legacyMarkdown) {
        const blocks = editor.tryParseMarkdownToBlocks(legacyMarkdown)
        editor.replaceBlocks(editor.document, blocks)
      }
      room.meta.set('blocknoteSeeded', true)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [editable, editor, room])

  const handleChange = () => {
    const markdown = editor.blocksToMarkdownLossy(editor.document)
    room.meta.set('excerpt', markdown.replace(/[#>*_`\-[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220))
  }

  return <BlockNoteView
    className={compact ? 'minute-blocknote minute-blocknote--compact' : 'minute-blocknote'}
    editor={editor}
    editable={editable}
    onChange={handleChange}
    theme={theme}
    data-testid="blocknote-editor"
  />
})
