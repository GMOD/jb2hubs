//
// builtDir.mjs
//
// Where the UCSC built tree is, for the node-side checks that read it.
//
// The pipeline's own default lives in ucsc2jbrowse/common.sh
// (`: "${UCSC_BUILT_DIR:=...}"`, exported), so every script that sources it
// inherits the answer. run.sh does not source it -- it sources lib/common.sh and
// runs make.sh as a subprocess -- so a gate invoked from run.sh sees no
// UCSC_BUILT_DIR at all. checkSidecarUrls.mjs survived that by hardcoding the
// path and checkTrackUrls.mjs did not, which on 2026-08-26 stopped the
// pre-upload gate with a usage error that run.sh then reported as "a config
// names a track file that is not in the built tree". Same default, one copy.
//
// An explicit --built-dir or UCSC_BUILT_DIR is never second-guessed: naming a
// directory that is not there is an error, not a reason to fall back silently.
// The built-in default is taken only when it exists, because it is a path on the
// build machine -- CI has no built tree, and the daily track-url canary runs
// there against the committed configs/ mirror. A default that hard-errored
// instead would take the canary down.
//
import fs from 'node:fs'

export const DEFAULT_BUILT_DIR = '/mnt/sdb/cdiesh/jb2hubs/ucscBuilt'

export function resolveBuiltDir(flag) {
  const explicit = flag ?? process.env.UCSC_BUILT_DIR
  let dir
  if (explicit) {
    dir = explicit
  } else {
    if (fs.existsSync(DEFAULT_BUILT_DIR)) {
      dir = DEFAULT_BUILT_DIR
    }
  }
  return dir
}
