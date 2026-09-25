// The lanes a gene-page reference's multi-way star holds, as
// public/synteny_stars.json carries them (generateSyntenyStars.ts)
export interface StarLanes {
  // every lane the star holds
  mates: string[]
  // NCBI taxon id -> the lane for that species where the page's own assembly
  // of it is not one: UCSC's newest build, else its newest GenArk assembly
  taxa: Record<string, string>
}

// <ucscDb> -> its star's lanes, for every reference whose config-staging.json
// carries a star
export type StarIndex = Record<string, StarLanes>

/**
 * A page row's lane: the assembly the row's genes are on where the star holds
 * it, under the name the ortholog index resolves it to (a UCSC db, or the
 * GenArk accession), else the species' lane
 */
export function starLane(
  lanes: StarLanes,
  row: { taxonId: number; assembly?: string },
  hosted: (
    accession: string,
  ) => { accession: string; ucscDb?: string } | undefined,
) {
  const genome = row.assembly ? hosted(row.assembly) : undefined
  return (
    [genome?.ucscDb, genome?.accession].find(
      name => name !== undefined && lanes.mates.includes(name),
    ) ?? lanes.taxa[row.taxonId]
  )
}
