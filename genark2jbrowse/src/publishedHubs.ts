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

// A category that fails to parse, or that UCSC lists empty, shrinks all.json
// and with it the site. On 2026-10-19 the viral category's 14,494 hubs went
// that way and the run deployed without them.
export const MAX_SHRINK_FRACTION = 0.05

export function assertNoSharpShrink(
  previous: number | undefined,
  next: number,
  allowed = !!process.env.ALLOW_HUB_LIST_SHRINK,
) {
  if (!allowed && previous && next < previous * (1 - MAX_SHRINK_FRACTION)) {
    throw new Error(
      `all.json would shrink from ${previous} to ${next} hubs; refusing. ALLOW_HUB_LIST_SHRINK=1 accepts a deliberate drop.`,
    )
  }
}
