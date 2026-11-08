// The page's walk-forms read, in a worker of its own: the read can run for
// seconds of CPU and an AbortSignal stops it only between awaits, while a
// worker can be terminated. In node, which has no page to block, the read runs
// in place, so `check-pangenome-launches` asks the same question.

import { workerClient } from './pangenomeWorkerClient.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { StructuralFormsResult } from './pangenomeSvStates.ts'
import type { PangenomeWorker } from './pangenomeWorkerClient.ts'

export interface WalkFormsRequest {
  walksUrl: string
  region: ParsedRegion
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

// The worker's read of the walk file's index serves the next question: HPRC's
// is 1.3 MB.
export const walkFormsClient = (
  spawn: () => PangenomeWorker<WalkFormsRequest, StructuralFormsResult>,
  deadlineMs = WALK_FORMS_DEADLINE_MS,
) =>
  workerClient(spawn, {
    name: 'walk forms',
    deadline: { ms: deadlineMs, error: () => new WalkFormsTooSlow(deadlineMs) },
  })

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
