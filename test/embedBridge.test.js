import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAllowedOrigins } from '../src/embedBridge.js'

test('embed origin allowlist includes the product origin and valid configured hosts', () => {
  const origins = parseAllowedOrigins('https://meet.google.com, https://teams.microsoft.com/path,not-a-url', 'https://minute.app')
  assert.deepEqual([...origins], ['https://minute.app', 'https://meet.google.com', 'https://teams.microsoft.com'])
})

test('embed origin allowlist rejects non-web protocols', () => {
  const origins = parseAllowedOrigins('javascript:alert(1),data:text/html,hello', 'https://minute.app')
  assert.deepEqual([...origins], ['https://minute.app'])
})
