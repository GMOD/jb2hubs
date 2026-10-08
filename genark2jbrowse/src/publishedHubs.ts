// UCSC's assemblyList.json names hubs it has never published: no hub.txt on
// either hgdownload host, so no config can be built and every page linking the
// accession launches a 404. 23 of 53,113 on 2026-10-08.
//
// Refuses when the share missing is implausible: a hubs/ tree that is absent or
// half checked out would otherwise read as "nothing is published" and empty the
// site.
export const MAX_UNPUBLISHED_FRACTION = 0.01

export function assertMostlyPublished(unpublished: number, listed: number) {
  if (unpublished > listed * MAX_UNPUBLISHED_FRACTION) {
    throw new Error(
      `${unpublished} of ${listed} listed hubs have no hub.txt; refusing to drop them`,
    )
  }
}
