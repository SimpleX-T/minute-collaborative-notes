import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMarkdownFormat } from '../src/formatting.js'

test('wraps selected text with Markdown emphasis', () => {
  const result = applyMarkdownFormat('Ship billing today', 5, 12, 'bold')
  assert.equal(result.value, 'Ship **billing** today')
  assert.equal(result.value.slice(result.start, result.end), 'billing')
})

test('formats every selected line as a task', () => {
  const result = applyMarkdownFormat('Prepare plan\nReview risk', 0, 24, 'task')
  assert.equal(result.value, '- [ ] Prepare plan\n- [ ] Review risk')
})

test('creates a fenced, language-labelled code block', () => {
  const result = applyMarkdownFormat('const answer = 42', 0, 17, 'codeblock')
  assert.equal(result.value, '```javascript\nconst answer = 42\n```')
})
