/**
 * The genome a MAF row can be opened in, when the portal hosts it. Emitted into
 * the track's `samples` so the MAF display can offer "open this species here"
 * (jbrowse-components `plugins/maf/src/LinearMafDisplay/openSampleInNewView.ts`).
 * The mapping is provenance, not a name lookup: only the hub that built the
 * alignment knows which assembly each row's coordinates are in.
 */
export interface UriLocation {
  uri: string
  locationType: 'UriLocation'
}

export interface SampleAssembly {
  assemblyName: string
  assemblyConfigLocation: UriLocation
}

export type SampleAssemblyResolver = (
  sampleId: string,
) => SampleAssembly | undefined

export interface MafSample {
  id: string
  label: string
  assemblyName?: string
  assemblyConfigLocation?: UriLocation
}

const words = (value: string | undefined) =>
  value?.split(/\s+/).filter(Boolean) ?? []

/**
 * The genome ids a bigMaf stanza lists: `speciesOrder`, else its `sGroup_*`
 * clades in `speciesGroups` order. VGP's vgp577way names only the clades.
 */
export function mafSpeciesIds(data: Record<string, string | undefined>) {
  return data.speciesOrder
    ? words(data.speciesOrder)
    : words(data.speciesGroups).flatMap(g => words(data[`sGroup_${g}`]))
}

/** `speciesLabels` pairs, `GCA_040894355.2="Bellinger river turtle" …` */
export function parseSpeciesLabels(value: string | undefined) {
  return new Map(
    [...(value ?? '').matchAll(/(\S+?)="([^"]*)"/g)].map(m => [m[1]!, m[2]!]),
  )
}

/**
 * Turn a bigMaf stanza's species list into the adapter's `samples`, labeled
 * from `speciesLabels` and attaching a navigation target for each id the
 * resolver knows. With no `samples`, the display discovers rows from the
 * blocks it has loaded and labels each with its bare genome id.
 *
 * UCSC omits the alignment's own reference from `speciesOrder`, but our display
 * does draw it as a row (the MAF's first `s` line resolves like any other), so
 * `referenceGenome` goes in front.
 */
export function mafSamples({
  data,
  referenceGenome,
  resolveSampleAssembly,
}: {
  data: Record<string, string | undefined>
  referenceGenome: string
  resolveSampleAssembly?: SampleAssemblyResolver
}): MafSample[] | undefined {
  const ids = mafSpeciesIds(data)
  if (ids.length === 0) {
    return undefined
  }
  const labels = parseSpeciesLabels(data.speciesLabels)
  return [...new Set([referenceGenome, ...ids])].map(id => ({
    id,
    label: labels.get(id) ?? id,
    ...resolveSampleAssembly?.(id),
  }))
}
