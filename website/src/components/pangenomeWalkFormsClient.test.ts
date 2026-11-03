import assert from 'node:assert'
import { test } from 'node:test'

import { structuralForms } from './pangenomeSvStates.ts'
import { walkFormsClient } from './pangenomeWalkFormsClient.ts'

import type {
  PostedWalkFormsRequest,
  WalkFormsReply,
  WalkFormsWorker,
} from './pangenomeWalkFormsClient.ts'

class FakeWorker implements WalkFormsWorker {
  requests: PostedWalkFormsRequest[] = []
  terminated = false
  onmessage: WalkFormsWorker['onmessage'] = null
  onerror: WalkFormsWorker['onerror'] = null
  postMessage(request: PostedWalkFormsRequest) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: WalkFormsReply) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

function client(deadlineMs?: number) {
  const workers: FakeWorker[] = []
  const ask = walkFormsClient(() => {
    const w = new FakeWorker()
    workers.push(w)
    return w
  }, deadlineMs)
  return { workers, ask }
}

const lpa = { chrom: 'chr6', start: 160_612_935, end: 160_649_819 }
const amy1 = { chrom: 'chr1', start: 103_619_117, end: 103_623_197 }
const forms = (haplotype: string) => structuralForms([], [haplotype])

test('one worker answers question after question', async () => {
  const { workers, ask } = client()
  const a = ask({ walksUrl: 'w', region: lpa })
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, forms: forms('A#1') })
  assert.deepEqual(await a, forms('A#1'))
  const b = ask({ walksUrl: 'w', region: amy1 })
  workers[0]!.reply({ id: workers[0]!.requests[1]!.id, forms: forms('B#1') })
  assert.deepEqual(await b, forms('B#1'))
  assert.equal(workers.length, 1)
  assert.equal(workers[0]!.terminated, false)
})

test('a failed read rejects its question and keeps the worker', async () => {
  const { workers, ask } = client()
  const a = ask({ walksUrl: 'w', region: lpa })
  workers[0]!.reply({
    id: workers[0]!.requests[0]!.id,
    error: { name: 'WalkFormsTooLarge', message: 'big', regionTooLarge: false },
  })
  await assert.rejects(a, { name: 'WalkFormsTooLarge' })
  assert.equal(workers[0]!.terminated, false)
})

test('an abort terminates the worker and reposts the rest to a fresh one', async () => {
  const { workers, ask } = client()
  const abort = new AbortController()
  const a = ask({ walksUrl: 'w', region: lpa }, abort.signal)
  const b = ask({ walksUrl: 'w', region: amy1 })
  abort.abort(new DOMException('dropped', 'AbortError'))
  await assert.rejects(a, { name: 'AbortError' })
  assert.equal(workers[0]!.terminated, true)
  assert.deepEqual(
    workers[1]!.requests.map(r => r.region),
    [amy1],
  )
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, forms: forms('B#1') })
  assert.deepEqual(await b, forms('B#1'))
})

test('a question past its deadline is too slow, and the worker is replaced', async () => {
  const { workers, ask } = client(5)
  await assert.rejects(ask({ walksUrl: 'w', region: lpa }), {
    name: 'WalkFormsTooSlow',
  })
  assert.equal(workers[0]!.terminated, true)
  const b = ask({ walksUrl: 'w', region: amy1 })
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, forms: forms('B#1') })
  assert.deepEqual(await b, forms('B#1'))
})

test('an aborted signal asks nothing', async () => {
  const { workers, ask } = client()
  await assert.rejects(
    ask({ walksUrl: 'w', region: lpa }, AbortSignal.abort()),
    { name: 'AbortError' },
  )
  assert.equal(workers.length, 0)
})
