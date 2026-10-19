// The range-served, tabix-indexed files the pangenome pages read in the
// visitor's browser: the sidecar, the reference's genes and the walk file.

import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { matchRefName } from './pangenomeRegion.ts'

// One reader per url for the life of the page, so the index and the header are
// read once rather than per query. Tabix drops a failed read of either instead
// of keeping it, so the next query retries what a transient failure lost.
const files = new Map<string, TabixIndexedFile>()

export function tabixFile(url: string, index: 'tbi' | 'csi') {
  let file = files.get(url)
  if (!file) {
    const indexFile = new RemoteFile(`${url}.${index}`)
    file = new TabixIndexedFile({
      filehandle: new RemoteFile(url),
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
    throw new Error(`${refName} is not a sequence in ${what}`)
  }
  return name
}
