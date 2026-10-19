const MIME = {
  markdown: 'text/markdown;charset=utf-8',
  text: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
  json: 'application/json;charset=utf-8'
}

export async function exportDocument(format, { title, markdown, html, blocks }) {
  const filename = safeFilename(title)
  if (format === 'markdown') return downloadBlob(`${filename}.md`, `# ${title}\n\n${markdown}`, MIME.markdown)
  if (format === 'text') return downloadBlob(`${filename}.txt`, markdownToText(`${title}\n\n${markdown}`), MIME.text)
  if (format === 'html') return downloadBlob(`${filename}.html`, htmlDocument(title, html), MIME.html)
  if (format === 'json') return downloadBlob(`${filename}.json`, JSON.stringify({ version: 1, title, exportedAt: new Date().toISOString(), blocks }, null, 2), MIME.json)
  if (format === 'docx') return exportDocx(filename, title, markdown)
  if (format === 'pdf') return exportPdf(filename, title, markdown)
  throw new Error(`Unsupported export format: ${format}`)
}

export function safeFilename(value) {
  return String(value || 'meeting-note').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'meeting-note'
}

export function markdownToText(value) {
  return String(value)
    .replace(/```[\w-]*\n([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function htmlDocument(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{max-width:720px;margin:64px auto;padding:0 24px;color:#242424;font:18px/1.7 Charter,Georgia,serif}h1,h2,h3{line-height:1.15}pre{overflow:auto;padding:18px;background:#20211f;color:#f4f4ef;border-radius:6px}code{font-family:ui-monospace,monospace}img{max-width:100%}</style></head><body><h1>${escapeHtml(title)}</h1>${content}</body></html>`
}

async function exportDocx(filename, title, markdown) {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx')
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd()
    const heading = line.match(/^(#{1,3})\s+(.+)/)
    if (heading) {
      const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3]
      children.push(new Paragraph({ text: heading[2], heading: levels[heading[1].length - 1] }))
    } else if (/^\s*[-*+]\s+/.test(line)) {
      children.push(new Paragraph({ text: line.replace(/^\s*[-*+]\s+/, ''), bullet: { level: 0 } }))
    } else {
      children.push(new Paragraph({ children: [new TextRun(markdownToText(line))], spacing: { after: line ? 120 : 40 } }))
    }
  }
  const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }))
  downloadBlob(`${filename}.docx`, blob)
}

async function exportPdf(filename, title, markdown) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 58
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  let y = 72
  pdf.setFont('times', 'bold')
  pdf.setFontSize(24)
  for (const line of pdf.splitTextToSize(title, pageWidth - margin * 2)) { pdf.text(line, margin, y); y += 28 }
  y += 18
  pdf.setFont('times', 'normal')
  pdf.setFontSize(12)
  for (const paragraph of markdownToText(markdown).split('\n')) {
    const lines = pdf.splitTextToSize(paragraph || ' ', pageWidth - margin * 2)
    for (const line of lines) {
      if (y > pageHeight - margin) { pdf.addPage(); y = margin }
      pdf.text(line, margin, y)
      y += 18
    }
    y += 5
  }
  pdf.save(`${filename}.pdf`)
}

function downloadBlob(filename, value, type) {
  const blob = value instanceof Blob ? value : new Blob([value], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character])
}
