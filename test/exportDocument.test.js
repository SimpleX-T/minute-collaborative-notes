import test from 'node:test'
import assert from 'node:assert/strict'
import { markdownToText, safeFilename } from '../src/exportDocument.js'

test('creates a portable filename from a meeting title', () => {
  assert.equal(safeFilename('API / Platform: Sync ✨'), 'api-platform-sync')
  assert.equal(safeFilename(''), 'meeting-note')
})

test('produces readable plain text from common markdown', () => {
  const text = markdownToText('## Decision\n- Ship the [API](https://example.com)\n- `Owner`: James')
  assert.equal(text, 'Decision\n• Ship the API\n• Owner: James')
})
