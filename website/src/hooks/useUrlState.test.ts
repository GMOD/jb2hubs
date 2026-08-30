import { createElement } from 'react'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderToString } from 'react-dom/server'

import { useUrlState } from './useUrlState.ts'

// The hook reads the URL through useSyncExternalStore, which is the only way to
// hold a value that differs between the server render and the client without
// mismatching hydration. Two things about that are easy to lose and silent when
// lost, and both fail this test rather than a page:
//
//   - a missing getServerSnapshot: React throws outright on the server
//   - reading window during the render: this file has no DOM at all, so any
//     path that reaches window in getServerSnapshot throws ReferenceError
//
// The pages that use it are Astro islands with client:load, so they really are
// server-rendered -- a lazy useState initializer reading location.search would
// hydrate against HTML built without it.

test('server-renders the default value without touching window', () => {
  function Probe() {
    const [value] = useUrlState('q', 'fallback')
    return createElement('span', null, value)
  }

  assert.equal(typeof globalThis.window, 'undefined')
  assert.match(renderToString(createElement(Probe)), />fallback</)
})
