import type { JBrowseConfig, UcscGenome } from '../types.ts'

/** Everything a finalize step is allowed to look at, for one assembly. */
export interface FinalizeContext {
  /** the built directory's name, which for a UCSC assembly is its db name */
  assemblyName: string
  /** `$UCSC_BUILT_DIR/<assemblyName>` — where config.json and the sidecars live */
  dir: string
  /**
   * `$UCSC_DOWNLOADS_DIR/<name>/<name>/database`, the rsync'd golden-path
   * tables. Hub assemblies have none, so a step that wants it has to check.
   */
  dbDir: string
  /**
   * this assembly's list.json entry. The runner only visits names the list
   * has, so this is present in practice; it stays optional because an index
   * lookup is.
   */
  genome: UcscGenome | undefined
  /** parsed once per assembly, mutated in place by each step in turn */
  config: JBrowseConfig
}

/**
 * A pass over one assembly's config. `run` mutates `ctx.config`; the runner
 * parses and writes config.json around the whole chain, so a step never reads
 * or writes it itself. A step may still write its own derived output beside it
 * — that is what createMinimalConfig does with minimal.json.
 *
 * The returned counters are summed across assemblies and printed as the run
 * summary, so a step reports `{ cytobands: 1 }` rather than logging a line per
 * assembly.
 */
export interface FinalizeStep {
  name: string
  run: (
    ctx: FinalizeContext,
  ) => Record<string, number> | Promise<Record<string, number>>
}
