import * as path from 'path'
import { fileURLToPath } from 'url'

// accession -> ISO timestamp of the run that first built its config. Tracked
// in git and appended to by buildConfigsBatch.ts; the recently-updated page is
// built from it.
export const hubFirstSeenPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'hubFirstSeen.json',
)
