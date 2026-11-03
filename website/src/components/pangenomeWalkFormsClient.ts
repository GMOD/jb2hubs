// The page's walk-forms read, in a worker of its own: the read can run for
// seconds of CPU and an AbortSignal stops it only between awaits, while a
// worker can be terminated. In node, which has no page to block, the read runs
// in place, so `check-pangenome-launches` asks the same question.

import { errorOf } from './pangenomeGraphLayout.ts'

import type { ReplyError } from './pangenomeGraphLayout.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type { StructuralFormsResult } from './pangenomeSvStates.ts'

export interface WalkFormsRequest {
  walksUrl: string
  region: ParsedRegion
}

export interface PostedWalkFormsRequest extends WalkFormsRequest {
  id: number
}

export type WalkFormsReply =
  | { id: number; forms: StructuralFormsResult; error?: undefined }
  | { id: number; error: ReplyError }

export interface WalkFormsWorker {
  postMessage(request: PostedWalkFormsRequest): void
  terminate(): void
  onmessage: ((e: MessageEvent<WalkFormsReply>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

// Past this the page answers from the callset's sidecar instead, well inside
// the box's 20 s deadline: MHC class II takes 10–17 s on a laptop, and a phone
// is slower.
const WALK_FORMS_DEADLINE_MS = 12_000

export class WalkFormsTooSlow extends Error {
  constructor(deadlineMs: number) {
    super(`no walk forms in ${deadlineMs / 1000} s`)
    this.name = 'WalkFormsTooSlow'
  }
}

interface Pending {
  request: PostedWalkFormsRequest
  resolve: (forms: StructuralFormsResult) => void
  reject: (e: Error) => void
}

// The worker outlives its questions, so the walk file's index it read serves
// the next one: HPRC's is 1.3 MB. A read cannot be interrupted, so an abort or
// a deadline terminates the worker and reposts the rest to a fresh one, and a
// failed worker rejects everything it owed.
export function walkFormsClient(
  spawn: () => WalkFormsWorker,
  deadlineMs = WALK_FORMS_DEADLINE_MS,
) {
  let worker: WalkFormsWorker | undefined
  let nextId = 0
  const pending = new Map<number, Pending>()

  function running() {
    if (!worker) {
      const w = spawn()
      w.onmessage = ({ data }) => {
        const p = pending.get(data.id)
        if (data.error === undefined) {
          p?.resolve(data.forms)
        } else {
          p?.reject(errorOf(data.error))
        }
      }
      w.onerror = e => {
        const owed = [...pending.values()]
        worker?.terminate()
        worker = undefined
        for (const p of owed) {
          p.reject(new Error(e.message || 'the walk forms worker failed'))
        }
      }
      worker = w
    }
    return worker
  }

  function restart() {
    worker?.terminate()
    worker = undefined
    for (const p of pending.values()) {
      running().postMessage(p.request)
    }
  }

  return function ask(request: WalkFormsRequest, signal?: AbortSignal) {
    return new Promise<StructuralFormsResult>((resolve, reject) => {
      signal?.throwIfAborted()
      const id = nextId++
      const settle = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        pending.delete(id)
      }
      const abandon = (e: Error) => {
        if (pending.has(id)) {
          settle()
          restart()
          reject(e)
        }
      }
      const abort = () => {
        const reason: unknown = signal?.reason
        abandon(
          reason instanceof Error
            ? reason
            : new DOMException('the question was dropped', 'AbortError'),
        )
      }
      const timer = setTimeout(() => {
        abandon(new WalkFormsTooSlow(deadlineMs))
      }, deadlineMs)
      signal?.addEventListener('abort', abort, { once: true })
      const posted = { ...request, id }
      pending.set(id, {
        request: posted,
        resolve: forms => {
          settle()
          resolve(forms)
        },
        reject: e => {
          settle()
          reject(e)
        },
      })
      running().postMessage(posted)
    })
  }
}

const askWorker = walkFormsClient(
  () =>
    new Worker(new URL('./pangenomeWalkForms.worker.ts', import.meta.url), {
      type: 'module',
    }),
)

async function readInPlace(request: WalkFormsRequest, signal?: AbortSignal) {
  const { readWalkForms } = await import('./pangenomeWalkForms.ts')
  return readWalkForms(request.walksUrl, request.region, signal)
}

export async function walkForms(
  request: WalkFormsRequest,
  signal?: AbortSignal,
) {
  return typeof Worker === 'undefined'
    ? readInPlace(request, signal)
    : askWorker(request, signal)
}
