export function applyMarkdownFormat(value, start, end, command) {
  const selection = value.slice(start, end)
  const wrap = (before, after = before, placeholder = 'text') => {
    const content = selection || placeholder
    return { value: value.slice(0, start) + before + content + after + value.slice(end), start: start + before.length, end: start + before.length + content.length }
  }
  if (command === 'bold') return wrap('**')
  if (command === 'italic') return wrap('_')
  if (command === 'code') return wrap('`')
  if (command === 'codeblock') return wrap('```javascript\n', '\n```', 'const result = await work()')
  if (command === 'link') {
    const content = selection || 'link text'
    const insertion = `[${content}](https://)`
    return { value: value.slice(0, start) + insertion + value.slice(end), start: start + content.length + 3, end: start + content.length + 11 }
  }
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndIndex = value.indexOf('\n', end)
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
  const block = value.slice(lineStart, lineEnd)
  const prefixes = { heading: '## ', bullet: '- ', task: '- [ ] ', quote: '> ' }
  const prefix = prefixes[command] || ''
  const transformed = block.split('\n').map(line => prefix + line).join('\n')
  return { value: value.slice(0, lineStart) + transformed + value.slice(lineEnd), start: lineStart + prefix.length, end: lineStart + transformed.length }
}
