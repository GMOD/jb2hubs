// An on/off habit of this reader's, kept in localStorage rather than a url.
// Without storage, as in some private windows, every flag reads off and a
// change is not kept.

// lib.dom types localStorage as always present, but it is absent under the node
// test runner and merely *reading* the property throws in Safari private mode, an
// embedded webview, or a browser set to block site data. Going through a function
// with a widened return type says what is true at runtime and keeps it from being
// narrowed straight back away — the same dodge features.ts uses for
// `import.meta.env`.
export function storage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage
}

export function readFlag(key: string) {
  try {
    return storage()?.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeFlag(key: string, on: boolean) {
  try {
    if (on) {
      storage()?.setItem(key, '1')
    } else {
      storage()?.removeItem(key)
    }
  } catch {
    // the flag keeps its default
  }
}
