// The page's pangenome workers, the graph layout and the walk-forms read,
// behind one client, and the worker side that answers it.

// postMessage keeps an Error's message but not its own fields or name
interface ReplyError {
  name: string
  message: string
  regionTooLarge: boolean
}

export type Posted<Request> = Request & { id: number }

export type Reply<Result> =
  | { id: number; result: Result; error?: undefined }
  | { id: number; error: ReplyError }

export interface PangenomeWorker<Request, Result> {
  postMessage(request: Posted<Request>): void
  terminate(): void
  addEventListener(
    type: 'message',
    listener: (e: MessageEvent<Reply<Result>>) => void,
  ): void
  addEventListener(type: 'error', listener: (e: ErrorEvent) => void): void
}

export class Superseded extends Error {
  constructor() {
    super('a request for another window replaced this one')
    this.name = 'Superseded'
  }
}

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

export function serve<Request, Result>(
  handler: (request: Request) => Promise<Result>,
) {
  self.addEventListener(
    'message',
    ({ data }: MessageEvent<Posted<Request>>) => {
      void handler(data)
        .then(
          (result): Reply<Result> => ({ id: data.id, result }),
          (e: unknown): Reply<Result> => ({
            id: data.id,
            error: replyError(e),
          }),
        )
        .then(reply => {
          self.postMessage(reply)
        })
    },
  )
}

interface Options<Request> {
  // names the worker in the error a crash rejects with
  name: string
  // a request for another window terminates the worker and rejects what it
  // still owed with Superseded
  windowOf?: (request: Request) => string
  deadline?: { ms: number; error: () => Error }
}

interface Pending<Request, Result> {
  key?: string
  request: Posted<Request>
  resolve: (result: Result) => void
  reject: (e: Error) => void
}

// The worker outlives its requests, so what it read for one serves the next.
// Its work cannot be interrupted, so an abort or a missed deadline terminates
// it and reposts the rest to a fresh one, and a failed worker rejects
// everything it owed.
export function workerClient<Request, Result>(
  spawn: () => PangenomeWorker<Request, Result>,
  { name, windowOf, deadline }: Options<Request>,
) {
  let worker: PangenomeWorker<Request, Result> | undefined
  let nextId = 0
  const pending = new Map<number, Pending<Request, Result>>()

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
      w.addEventListener('message', ({ data }) => {
        const p = pending.get(data.id)
        if (data.error === undefined) {
          p?.resolve(data.result)
        } else {
          p?.reject(errorOf(data.error))
        }
      })
      w.addEventListener('error', e => {
        drop(new Error(e.message || `the ${name} worker failed`))
      })
      worker = w
    }
    return worker
  }

  function restart() {
    terminate()
    for (const p of pending.values()) {
      running().postMessage(p.request)
    }
  }

  return function ask(request: Request, signal?: AbortSignal) {
    return new Promise<Result>((resolve, reject) => {
      signal?.throwIfAborted()
      const key = windowOf?.(request)
      if ([...pending.values()].some(p => p.key !== key)) {
        drop(new Superseded())
      }
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
            : new DOMException('the request was dropped', 'AbortError'),
        )
      }
      const timer =
        deadline &&
        setTimeout(() => {
          abandon(deadline.error())
        }, deadline.ms)
      signal?.addEventListener('abort', abort, { once: true })
      const posted = { ...request, id }
      pending.set(id, {
        key,
        request: posted,
        resolve: result => {
          settle()
          resolve(result)
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
