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

export type WalkFormsReply =
  | { forms: StructuralFormsResult; error?: undefined }
  | { error: ReplyError }

// Past this the page answers from the callset's sidecar instead, well inside
// the box's 20 s deadline: MHC class II takes 10–17 s on a laptop, and a phone
// is slower.
const WALK_FORMS_DEADLINE_MS = 12_000

export class WalkFormsTooSlow extends Error {
  constructor() {
    super(`no walk forms in ${WALK_FORMS_DEADLINE_MS / 1000} s`)
    this.name = 'WalkFormsTooSlow'
  }
}

export async function walkForms(
  request: WalkFormsRequest,
  signal?: AbortSignal,
): Promise<StructuralFormsResult> {
  if (typeof Worker === 'undefined') {
    const { readWalkForms } = await import('./pangenomeWalkForms.ts')
    return readWalkForms(request.walksUrl, request.region, signal)
  }
  signal?.throwIfAborted()
  const worker = new Worker(
    new URL('./pangenomeWalkForms.worker.ts', import.meta.url),
    { type: 'module' },
  )
  return new Promise<StructuralFormsResult>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      done()
      const reason: unknown = signal!.reason
      reject(
        reason instanceof Error
          ? reason
          : new DOMException('the question was dropped', 'AbortError'),
      )
    }
    const timer = setTimeout(() => {
      done()
      reject(new WalkFormsTooSlow())
    }, WALK_FORMS_DEADLINE_MS)
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<WalkFormsReply>) => {
      done()
      if (data.error === undefined) {
        resolve(data.forms)
      } else {
        reject(errorOf(data.error))
      }
    }
    worker.onerror = e => {
      done()
      reject(new Error(e.message || 'the walk forms worker failed'))
    }
    worker.postMessage(request)
  })
}
