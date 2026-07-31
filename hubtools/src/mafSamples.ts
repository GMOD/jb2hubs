/**
 * The genome a MAF row can be opened in, when the portal hosts it. Emitted into
 * the track's `samples` so the MAF display can offer "open this species here" —
 * see jbrowse-components `agent-docs/guides/MAF_CROSS_VIEW_NAVIGATION.md`. The
 * mapping is provenance, not a name lookup: only the hub that built the
 * alignment knows which assembly each row's coordinates are in.
 */
export interface SampleAssembly {
  assemblyName: string
  assemblyConfigUrl: string
}

export type SampleAssemblyResolver = (
  sampleId: string,
) => SampleAssembly | undefined

export interface MafSample {
  id: string
  label: string
  assemblyName?: string
  assemblyConfigUrl?: string
}

/**
 * Turn a trackDb `speciesOrder` (space-separated genome ids, in the order the
 * alignment stores its rows) into the adapter's `samples`, attaching a
 * navigation target for each id the resolver knows.
 *
 * `speciesOrder` is the alignment's own row order, so emitting it fixes the row
 * order in the display and populates the row labels — worth doing even when
 * nothing resolves to an assembly.
 *
 * UCSC omits the alignment's own reference from `speciesOrder`, but our display
 * does draw it as a row (the MAF's first `s` line resolves like any other), so
 * `referenceGenome` goes in front. Without it, listing `samples` would silently
 * drop the row that sample-discovery used to produce.
 */
export function mafSamplesFromSpeciesOrder({
  speciesOrder,
  referenceGenome,
  resolveSampleAssembly,
}: {
  speciesOrder: string
  referenceGenome: string
  resolveSampleAssembly?: SampleAssemblyResolver
}): MafSample[] {
  const ids = speciesOrder
    .trim()
    .split(/\s+/)
    .filter(id => !!id)
  return [
    ...new Set([referenceGenome, ...ids]),
  ].map(id => ({ id, label: id, ...resolveSampleAssembly?.(id) }))
}
