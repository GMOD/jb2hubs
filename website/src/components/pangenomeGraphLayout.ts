// What the page asks the focused-row graph's layout worker, what the worker
// answers, and the one worker the page keeps.

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { AbridgedWalk } from './pangenomeWalkCut.ts'

export interface GraphRequest {
  id: number
  walksUrl: string
  region: ParsedRegion
  haplotype?: string
  // abridged haplotypes to read in full, beside `haplotype`
  expand: string[]
}

// the graph's SVG, and the walks it draws abridged
export interface Drawn {
  image: string
  abridged: AbridgedWalk[]
}

// postMessage keeps an Error's message but not its own fields or name
export interface ReplyError {
  name: string
  message: string
  regionTooLarge: boolean
}

export type GraphReply =
  | ({ id: number; error?: undefined } & Drawn)
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
  request: GraphRequest
  resolve: (drawn: Drawn) => void
  reject: (e: Error) => void
}

// The worker outlives its requests, so its cut of a window serves the next
// row's highlight. Neither a layout nor a stalled read can be interrupted, so
// a request for another window and a failed worker terminate it and reject
// what it still owed, and an abort terminates it and reposts the rest to a
// fresh one.
export function layoutClient(spawn: () => LayoutWorker) {
  let worker: LayoutWorker | undefined
  let nextId = 0
  const pending = new Map<number, Pending>()

  function terminate() {
    worker?.terminate()
    worker = undefined
  }

  function drop(reason: Error) {
    terminate()
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
          p?.resolve({ image: data.image, abridged: data.abridged })
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

  return function draw(request: Omit<GraphRequest, 'id'>, signal: AbortSignal) {
    return new Promise<Drawn>((resolve, reject) => {
      signal.throwIfAborted()
      const key = windowKey(request.walksUrl, request.region)
      if ([...pending.values()].some(p => p.key !== key)) {
        drop(new Superseded())
      }
      const id = nextId++
      const abort = () => {
        const p = pending.get(id)
        if (p) {
          pending.delete(id)
          terminate()
          for (const owed of pending.values()) {
            running().postMessage(owed.request)
          }
          p.reject(signal.reason)
        }
      }
      signal.addEventListener('abort', abort, { once: true })
      const posted = { ...request, id }
      pending.set(id, {
        key,
        request: posted,
        resolve: drawn => {
          signal.removeEventListener('abort', abort)
          resolve(drawn)
        },
        reject: e => {
          signal.removeEventListener('abort', abort)
          reject(e)
        },
      })
      running().postMessage(posted)
    })
  }
}
