import { categoryLabel } from './const.ts'
import { isString, isStringArray } from './guards.ts'

import type { Track } from './types.ts'

// UCSC's `grp` table priorities, as hg38 and hg19 carry them, for a config
// with no table of its own: a GenArk hub, or an assembly UCSC serves as one.
const UCSC_GROUP_PRIORITIES: [string, number][] = [
  ['map', 2],
  ['genes', 3],
  ['phenDis', 3.4],
  ['pub', 3.5],
  ['varRep', 3.55],
  ['hprc', 3.6],
  ['rna', 4],
  ['expression', 4.5],
  ['singleCell', 4.7],
  ['regulation', 5],
  ['compGeno', 6],
  ['neandertal', 6.5],
  ['denisova', 6.6],
  ['rep', 8],
]

// what most readers open a browser for, so it leads whatever UCSC ranks it
const FIRST = categoryLabel('genes')
// ours, not UCSC's: one liftOver track per other assembly
const LAST = 'Pairwise alignments'

/**
 * Ranks a track selector group by UCSC's own order for the assembly, a `grp`
 * table's `[group, priority]` rows, with genes moved to the front. A group the
 * table lacks follows the ones it has, and liftOver follows everything.
 */
export function groupRanker(priorities = UCSC_GROUP_PRIORITIES) {
  const byLabel = new Map(
    priorities.map(([group, priority]) => [categoryLabel(group), priority]),
  )
  const unranked = Math.max(0, ...byLabel.values()) + 1
  return (label: string) =>
    label === FIRST
      ? -1
      : label === LAST
        ? unranked + 1
        : (byLabel.get(label) ?? unranked)
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function categoryOf(track: Track) {
  return isStringArray(track.category) ? track.category : []
}

function nameOf(track: Track) {
  return isString(track.name) ? track.name : ''
}

/**
 * A config's tracks in the order its track selector should list them: the
 * uncategorized ones as they came, then each group by `rankOf`, a group's own
 * tracks by name ahead of its subcategories. The config turns the selector's
 * own sorting off (`hierarchical.sort`), since that orders groups by the
 * alphabet alone, which opened every list on Comparative Genomics, and every
 * host draws tracks in config order.
 */
export function tracksInTreeOrder<T extends Track>(
  tracks: T[],
  rankOf = groupRanker(),
) {
  return tracks.toSorted((a, b) => {
    const [groupA, ...restA] = categoryOf(a)
    const [groupB, ...restB] = categoryOf(b)
    return groupA === undefined || groupB === undefined
      ? Number(groupA !== undefined) - Number(groupB !== undefined)
      : rankOf(groupA) - rankOf(groupB) ||
          collator.compare(groupA, groupB) ||
          collator.compare(restA.join('\n'), restB.join('\n')) ||
          collator.compare(nameOf(a), nameOf(b))
  })
}
