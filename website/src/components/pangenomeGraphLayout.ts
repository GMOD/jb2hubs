// The page's side of the focused-row graph's layout worker: what it asks, what
// the worker answers, and one worker at a time.

import type { ParsedRegion } from './pangenomeRegion.ts'

export interface GraphRequest {
  id: number
  walksUrl: string
  region: ParsedRegion
  haplotype?: string
}

// postMessage keeps an Error's message but not its own fields or name
export interface ReplyError {
  name: string
  message: string
  regionTooLarge: boolean
}

export type GraphReply =
  | { id: number; image: string; error?: undefined }
  | { id: number; error: ReplyError }

export interface LayoutWorker {
  postMessage(request: GraphRequest): void
  terminate(): void
  onmessage: ((e: MessageEvent<GraphReply>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

export class Superseded extends Error {
  constructor() {
    super('a graph of another window replaced this one')
    this.name = 'Superseded'
  }
}

export const windowKey = (
  walksUrl: string,
  { chrom, start, end }: ParsedRegion,
) => `${walksUrl} ${chrom}:${start}-${end}`

export function replyError(e: unknown): ReplyError {
  return e instanceof Error
    ? {
        name: e.name,
        message: e.message,
        regionTooLarge: 'regionTooLarge' in e,
      }
    : { name: 'Error', message: String(e), regionTooLarge: false }
}

export function errorOf({ name, message, regionTooLarge }: ReplyError) {
  const error = Object.assign(new Error(message), { name })
  return regionTooLarge ? Object.assign(error, { regionTooLarge }) : error
}

interface Pending {
  key: string
  resolve: (image: string) => void
  reject: (e: unknown) => void
}

// The worker outlives its requests, so its cut of a window serves the next
// row's highlight. Neither a layout nor a stalled read can be interrupted, so
// a request for another window, an aborted request and a failed worker each
// terminate it and reject what it still owed.
export function layoutClient(spawn: () => LayoutWorker) {
  let worker: LayoutWorker | undefined
  let nextId = 0
  const pending = new Map<number, Pending>()

  function drop(reason: unknown) {
    worker?.terminate()
    worker = undefined
    const owed = [...pending.values()]
    pending.clear()
    for (const p of owed) {
      p.reject(reason)
    }
  }

  function running() {
    if (!worker) {
      const w = spawn()
      w.onmessage = ({ data }) => {
        const p = pending.get(data.id)
        pending.delete(data.id)
        if (data.error === undefined) {
          p?.resolve(data.image)
        } else {
          p?.reject(errorOf(data.error))
        }
      }
      w.onerror = e => {
        drop(new Error(e.message || 'the graph layout worker failed'))
      }
      worker = w
    }
    return worker
  }

  return function draw(
    walksUrl: string,
    region: ParsedRegion,
    haplotype: string | undefined,
    signal: AbortSignal,
  ) {
    const key = windowKey(walksUrl, region)
    if ([...pending.values()].some(p => p.key !== key)) {
      drop(new Superseded())
    }
    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      const id = nextId++
      const abort = () => {
        if (pending.has(id)) {
          drop(signal.reason)
        }
      }
      signal.addEventListener('abort', abort, { once: true })
      pending.set(id, {
        key,
        resolve: image => {
          signal.removeEventListener('abort', abort)
          resolve(image)
        },
        reject: e => {
          signal.removeEventListener('abort', abort)
          reject(e)
        },
      })
      running().postMessage({ id, walksUrl, region, haplotype })
    })
  }
}
