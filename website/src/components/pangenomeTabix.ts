// The range-served, tabix-indexed files the pangenome pages read in the
// visitor's browser: the sidecar, the reference's genes and the walk file.

import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { HttpError } from '../lib/fetchJson.ts'
import { matchRefName } from './pangenomeRegion.ts'

class FileUnreachable extends Error {
  constructor(url: string, cause: unknown) {
    super(`no answer fetching ${url}`, { cause })
    this.name = 'FileUnreachable'
  }
}

class NotInFile extends Error {
  constructor(refName: string, what: string) {
    super(`${refName} is not a sequence in ${what}`)
    this.name = 'NotInFile'
  }
}

// A read the server refused throws HttpError and one it never answered
// FileUnreachable, so a fallback can test for a failed read by name, which
// survives a worker.
class PageFile extends RemoteFile {
  override async fetch(input: RequestInfo, init?: RequestInit) {
    const res = await super.fetch(input, init).catch((e: unknown) => {
      throw init?.signal?.aborted ? e : new FileUnreachable(this.url, e)
    })
    if (!res.ok && res.status !== 416) {
      throw new HttpError(`HTTP ${res.status} fetching ${this.url}`, res.status)
    }
    return res
  }
}

// One reader per url for the life of the page, so the index and the header are
// read once rather than per query. Tabix drops a failed read of either instead
// of keeping it, so the next query retries what a transient failure lost.
const files = new Map<string, TabixIndexedFile>()

export function tabixFile(url: string, index: 'tbi' | 'csi') {
  let file = files.get(url)
  if (!file) {
    const indexFile = new PageFile(`${url}.${index}`)
    file = new TabixIndexedFile({
      filehandle: new PageFile(url),
      ...(index === 'csi'
        ? { csiFilehandle: indexFile }
        : { tbiFilehandle: indexFile }),
    })
    files.set(url, file)
  }
  return file
}

// The file's own name for `refName`, or an error naming `what` the file is:
// tabix answers an unknown name with no rows, which would read as an empty
// window.
export async function fileRefName(
  file: TabixIndexedFile,
  refName: string,
  what: string,
  signal?: AbortSignal,
) {
  const name = matchRefName(
    refName,
    await file.getReferenceSequenceNames({ signal }),
  )
  if (name === undefined) {
    throw new NotInFile(refName, what)
  }
  return name
}
