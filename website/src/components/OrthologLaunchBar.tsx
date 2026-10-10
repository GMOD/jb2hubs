import { useMemo } from 'react'

import { features } from '../config/features.ts'
import { LaunchLink } from './DesktopLaunch.tsx'
import { starUrl } from './multiSyntenyDrilldown.ts'
import { planFromSelection, syntenyCandidates } from './multiSyntenyPicker.ts'
import {
  SYNTENY_FLANK_BP,
  buildMultiSyntenyUrl,
  flankLoc,
  placedOnHosted,
  sideBySideUrl,
} from './orthologSearchUtils.ts'

import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'

interface Props {
  picked: OrthologResult[]
  results: OrthologResult[]
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
  lineages: Map<number, Set<number>> | undefined
  onClear: () => void
}

// The ticked rows, opened together with the reference: side by side for any
// set of genomes, as a synteny stack where the catalog chains them (against
// human every comparison is to hg38, so a stack stops at three), and as the
// reference's multi-way lanes where its config carries a star.
export default function OrthologLaunchBar({
  picked,
  results,
  refResult,
  drilldown,
  lineages,
  onClear,
}: Props) {
  const ref = refResult && placedOnHosted(refResult) ? refResult : undefined
  const candidates = useMemo(
    () =>
      ref && drilldown
        ? syntenyCandidates(
            results,
            ref.assembly.accession,
            ref.assembly.taxonId,
            drilldown.index,
            lineages,
          )
        : [],
    [results, ref, drilldown, lineages],
  )
  const selected = new Set(picked.map(r => r.assembly.accession))
  const { plan, unplaced } =
    ref && drilldown
      ? planFromSelection(candidates, ref, selected, drilldown.index)
      : { plan: null, unplaced: [] }
  const chain = plan && plan.rows.length >= 3 ? plan : undefined
  const lanes =
    features.multiwayStar && ref && drilldown
      ? starUrl(
          ref.assembly.accession,
          flankLoc(ref.refName, ref.begin, ref.end, SYNTENY_FLANK_BP),
          picked.map(r => ({
            taxonId: r.assembly.taxonId,
            assembly: r.assembly.accession,
          })),
          drilldown,
        )
      : undefined
  const sideBySide = sideBySideUrl(refResult ? [refResult, ...picked] : picked)

  return (
    <div
      className="orthologs-launchbar"
      role="region"
      aria-label="Open the ticked species"
    >
      <strong>{picked.length} ticked</strong>
      <LaunchLink
        className="ui-btn"
        href={sideBySide}
        title="One genome browser per species, each at its ortholog"
      >
        Side by side
      </LaunchLink>
      {chain && (
        <LaunchLink
          className="ui-btn-secondary"
          href={buildMultiSyntenyUrl(chain)}
          title={`${chain.rows.map(r => r.assembly.scientificName).join(' → ')}${
            unplaced.length > 0
              ? `. No synteny track places ${unplaced.map(r => r.assembly.scientificName).join(', ')} in the stack.`
              : ''
          }`}
        >
          Synteny stack ({chain.rows.length})
        </LaunchLink>
      )}
      {lanes && (
        <LaunchLink
          className="ui-btn-secondary"
          href={lanes}
          title="One lane per ticked species against the reference, from the reference's liftOver chains"
        >
          Multi-way lanes
        </LaunchLink>
      )}
      <button
        className="ui-linkbtn"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  )
}
