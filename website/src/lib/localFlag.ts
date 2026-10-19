// An on/off habit of this reader's, kept in localStorage rather than a url.
// Without storage, as in some private windows, every flag reads off and a
// change is not kept.
function storage() {
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
