import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { applyTextChange } from '../src/collaboration.js'

test('translates a browser text edit into a minimal CRDT change', () => {
  const doc = new Y.Doc()
  const text = doc.getText('body')
  text.insert(0, 'James owns the plan')
  applyTextChange(text, 'James owns the plan', 'James and Maya own the plan')
  assert.equal(text.toString(), 'James and Maya own the plan')
})

test('concurrent updates converge without losing either author', () => {
  const left = new Y.Doc()
  const right = new Y.Doc()
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left))
  left.getText('body').insert(0, 'Decision: ship')
  right.getText('body').insert(0, 'Owner: James\n')
  const leftUpdate = Y.encodeStateAsUpdate(left)
  const rightUpdate = Y.encodeStateAsUpdate(right)
  Y.applyUpdate(left, rightUpdate)
  Y.applyUpdate(right, leftUpdate)
  assert.equal(left.getText('body').toString(), right.getText('body').toString())
  assert.match(left.getText('body').toString(), /Decision: ship/)
  assert.match(left.getText('body').toString(), /Owner: James/)
})
