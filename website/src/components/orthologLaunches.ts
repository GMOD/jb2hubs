// The JBrowse launches an ortholog row opens: its own genome, its synteny with
// the reference, and the multi-way and side-by-side views over several rows.

import {
  genomeAssemblyName,
  genomeConfigPath,
  genomeGeneTrack,
  jbrowseUrl,
} from '../config/jbrowse.ts'
import {
  flipLoc,
  mergeConfig,
  panelTracks,
  specUrl,
  syntenyViewUrl,
} from './jbrowseLinks.ts'
import { resolveStackNames, syntenyLink } from './syntenyPairIndex.ts'

import type { HostedGenomeRef } from '../config/jbrowse.ts'
import type { OrthologResult } from './orthologResults.ts'
import type { PairIndex, SyntenyLink } from './syntenyPairIndex.ts'

// Single-genome launch URL. A UCSC-native assembly (ucscDb set) uses the
// curated /ucsc/<db> config, because its GenArk config's sequence data 404s.
// Others use the GenArk hub path. NCBI's RefSeq refName in loc resolves through
// chromAlias in both.
export function accessionToJbrowseUrl(
  genome: HostedGenomeRef,
  gene?: GeneLocus,
) {
  // A locus launch opens only the tracks it names, so it names the gene track.
  const track = genomeGeneTrack(genome)
  return jbrowseUrl(genomeConfigPath(genome), {
    assembly: genomeAssemblyName(genome),
    loc: gene && geneWindow(gene),
    tracks: track ? [track] : [],
    highlight: gene && geneHighlight(gene)[0],
  })
}

// Opens a fifth of the gene's length either side (1 kb at least), gene
// highlighted.
function geneWindow(g: GeneLocus) {
  return flankLoc(
    g.refName,
    g.start,
    g.end,
    Math.max(1000, Math.round((g.end - g.start) / 5)),
  )
}

// Whether a row's coordinates belong to the genome its synteny panel opens.
// syntenyLink matches version-stripped accessions, so it cannot place a locus:
// NCBI reports against the version it annotated, whose refNames the catalog
// version's chromAlias may not know, and the panel opens at position 0 (5 of 38
// TP53 rows against human). A UCSC db name is another naming scheme, not
// another assembly, so `hg38` matches only the row the ortholog index maps to
// hg38.
export function isSameGenome(
  panelName: string,
  hosted: { accession: string; ucscDb?: string },
) {
  return panelName === hosted.accession || panelName === hosted.ucscDb
}

// Whether a row's coordinates are the hosted version's own, rather than those
// of a version NCBI annotated and we do not host.
export function placedOnHosted(r: OrthologResult) {
  return r.otherVersion === undefined
}

// The synteny link for a row, only when its panel is the genome the row's
// coordinates came from. Callers that navigate the panel use this, not
// syntenyLink. A row NCBI placed on another version gets none. refName only
// where the two versions share that sequence.
export function orthologSyntenyLink(
  index: PairIndex,
  r: OrthologResult,
  otherAccession: string,
) {
  const link = syntenyLink(index, r.assembly.accession, otherAccession)
  return link && placedOnHosted(r) && isSameGenome(link.names[0], r.assembly)
    ? link
    : undefined
}

// bp of context either side of the ortholog gene; at gene scale the ribbons
// would be invisible.
export const SYNTENY_FLANK_BP = 100_000

// A refName:start-end locstring expanded by flankBp each side, clamped to 1
// (locstrings are 1-based) so a gene near a contig start stays parseable.
export function flankLoc(
  refName: string,
  start: number,
  end: number,
  flankBp: number,
) {
  return `${refName}:${Math.max(1, start - flankBp)}-${end + flankBp}`
}

// A gene's place on its own genome, under the refName a launch navigates by.
interface GeneLocus {
  refName: string
  start: number
  end: number
}

function locusOf(r: OrthologResult): GeneLocus {
  return { refName: r.refName, start: r.begin, end: r.end }
}

function windowedLoc(r: OrthologResult, flankBp: number) {
  return flankLoc(r.refName, r.begin, r.end, flankBp)
}

// The gene itself, marked in a panel that opens on a window around it.
function geneHighlight({ refName, start, end }: GeneLocus) {
  return [`${refName}:${start}-${end}`]
}

// The pairwise ortholog-vs-reference launch. The ortholog's panel leads and
// flips, since the reference is the reader's frame. Each panel gets its own
// gene track because a synteny sub-view has no defaultSession. Panel assemblies
// come from the link, not the accessions: naming the accession merges a hub
// without the track.
export function pairwiseOrthologUrl(
  link: SyntenyLink,
  ortholog: GeneLocus,
  ref: GeneLocus | undefined,
  flipped: boolean,
  flankBp = SYNTENY_FLANK_BP,
) {
  const window = (g: GeneLocus) => flankLoc(g.refName, g.start, g.end, flankBp)
  return syntenyViewUrl(
    [
      {
        assembly: link.names[0],
        loc: flipLoc(window(ortholog), flipped),
        highlight: geneHighlight(ortholog),
        ...panelTracks(link.geneTracks[0]),
      },
      {
        assembly: link.names[1],
        ...(ref ? { loc: window(ref), highlight: geneHighlight(ref) } : {}),
        ...panelTracks(link.geneTracks[1]),
      },
    ],
    [link.trackId],
    // No autoDiagonalize: it reverses the reference panel to match a flipped
    // ortholog panel, undoing the flip.
    {
      encoding: { color: { field: 'query' } },
      mark: { interpolate: 'bump' },
    },
  )
}

// Which synteny stack rows open flipped, so the ortholog points the same way in
// every panel (BRCA1 is minus on hg38 chr17 and plus on chimp). The top row is
// the frame, because the chain grows outward from a mid-stack reference and
// anchoring there would flip more rows. fewer rows.
export function strandFlips(rows: OrthologResult[]) {
  const anchor = rows[0]?.strand ?? 1
  return rows.map(r => r.strand !== anchor)
}

// A table row's pairwise launch against the reference row, which is left
// unnavigated when unknown, placed on a version we do not host, or when the
// catalog pairs the row with another version of the reference genome
// (mm39_to_GCF_029281585.1 for a .2 reference). The row's panel flips when its
// ortholog runs the other way from the reference's.
export function orthoSyntenyUrl(
  r: OrthologResult,
  link: SyntenyLink,
  refRow: OrthologResult | undefined,
  flankBp = SYNTENY_FLANK_BP,
) {
  const ref =
    refRow &&
    placedOnHosted(refRow) &&
    isSameGenome(link.names[1], refRow.assembly)
      ? refRow
      : undefined
  return pairwiseOrthologUrl(
    link,
    locusOf(r),
    ref && locusOf(ref),
    ref !== undefined && r.strand !== ref.strand,
    flankBp,
  )
}

interface MultiSyntenyPlan {
  // top-to-bottom row order
  rows: OrthologResult[]
  // names[i] is the assembly name rows[i]'s panel opens under, which is not
  // always the accession — see pairwiseOrthologUrl
  names: (string | undefined)[]
  // geneTracks[i] is the gene track rows[i]'s panel opens, '' where the catalog
  // knows none
  geneTracks: string[]
  // tracks[i] holds the synteny track linking rows[i] and rows[i + 1], and is
  // empty where none does: JBrowse binds tracks to levels by position, so a
  // missing level has to keep its slot
  tracks: string[][]
}

// Orders the ortholog rows into a chain where every adjacent pair has a synteny
// track: a LinearSyntenyView draws ribbons only between adjacent rows. The
// chain grows outward from the reference at both ends, each step taking the
// closest-ranked unused species with a track to the chain's end. A star-shaped
// catalog (every ortholog links only to the reference) yields 3 rows, the
// reference flanked by its two nearest partners; path-shaped catalogs yield
// longer stacks. Returns null when nothing chains to the reference.
export function planMultiSynteny(
  results: OrthologResult[],
  refAccession: string,
  index: PairIndex,
): MultiSyntenyPlan | null {
  const ref = results.find(r => r.assembly.accession === refAccession)
  if (!ref) {
    return null
  }
  // A row's index is its preference rank: syntenyCandidates
  // (multiSyntenyPicker.ts) passes shared-lineage order; a raw result set ranks
  // by COMMON_TAX_RANK, then name. Greedy on purpose: a DFS over TP53's catalog
  // finds an arbitrary 12-genome chain.
  const rank = new Map(results.map((r, i) => [r.assembly.accession, i]))
  const used = new Set([refAccession])
  const chain = [ref]
  // The assembly name each chained row's panel opens under, fixed by its
  // placing link. A genome known under two names (UCSC dm6 and its accession)
  // can be one panel only, so an extension whose link disagrees with the
  // assigned name, or names another version than the row's, is not a valid
  // step.
  const names = new Map<string, string>()

  function bestNeighbor(node: OrthologResult) {
    const nodeAcc = node.assembly.accession
    let best: { result: OrthologResult; link: SyntenyLink } | undefined
    let bestRank = Infinity
    for (const r of results) {
      const acc = r.assembly.accession
      const link = used.has(acc) ? undefined : syntenyLink(index, nodeAcc, acc)
      const settled = names.get(nodeAcc)
      const rk = rank.get(acc) ?? Infinity
      if (
        link &&
        rk < bestRank &&
        (!settled || settled === link.names[0]) &&
        isSameGenome(link.names[0], node.assembly) &&
        isSameGenome(link.names[1], r.assembly)
      ) {
        best = { result: r, link }
        bestRank = rk
      }
    }
    return best
  }

  function extend(end: 'head' | 'tail') {
    const node = end === 'tail' ? chain.at(-1) : chain.at(0)
    const next = node && bestNeighbor(node)
    if (next) {
      names.set(node.assembly.accession, next.link.names[0])
      names.set(next.result.assembly.accession, next.link.names[1])
      used.add(next.result.assembly.accession)
      if (end === 'tail') {
        chain.push(next.result)
      } else {
        chain.unshift(next.result)
      }
    }
    return !!next
  }

  while (extend('tail') || extend('head')) {
    // grow the tail as far as it goes, then the head
  }

  if (chain.length < 2) {
    return null
  }
  // The resolver reproduces `names` and drops nothing; going through it keeps
  // one copy of the panel-naming rule.
  const stack = resolveStackNames(
    chain.map(r => r.assembly.accession),
    index,
    (i, name) => {
      const row = chain[i]
      return row !== undefined && isSameGenome(name, row.assembly)
    },
  )
  return { rows: chain, ...stack }
}

// Multi-row LinearSyntenyView launch URL: one level per adjacent pair carrying
// its synteny track, each panel on its ortholog's window with its gene track
// open, flipped where the ortholog runs the other way.
export function buildMultiSyntenyUrl(
  plan: MultiSyntenyPlan,
  flankBp = SYNTENY_FLANK_BP,
) {
  const flips = strandFlips(plan.rows)
  return syntenyViewUrl(
    plan.rows.map((r, i) => ({
      assembly: plan.names[i] ?? r.assembly.accession,
      loc: flipLoc(windowedLoc(r, flankBp), flips[i] ?? false),
      highlight: geneHighlight(locusOf(r)),
      ...panelTracks(plan.geneTracks[i] ?? ''),
    })),
    plan.tracks,
  )
}

// Rows side by side as LinearGenomeViews in one merged session; no track has to
// join rows, so any set of genomes works. A UCSC genome opens under its db with
// the index's gene track, a GenArk hub under its accession with its NCBI GFF3.
export function sideBySideUrl(rows: OrthologResult[]) {
  const names = rows.map(r => genomeAssemblyName(r.assembly))
  return specUrl(
    mergeConfig(names),
    rows.map((r, i) => {
      const track = r.assembly.ucscDb
        ? r.assembly.geneTrack
        : `${r.assembly.accession}-ncbiGff`
      return {
        type: 'LinearGenomeView',
        assembly: names[i],
        loc: geneWindow(locusOf(r)),
        highlight: geneHighlight(locusOf(r)),
        ...panelTracks(track ?? ''),
      }
    }),
  )
}

// The synteny link each row opens, where the catalog has one against the
// reference. Not syntenyLink: it matches across assembly versions, and a panel
// opening a version the row's coordinates did not come from does not navigate
// at all. See orthologSyntenyLink.
export function syntenyLinks(
  results: OrthologResult[],
  pairIndex: PairIndex | undefined,
  refAccession: string | undefined,
) {
  const found = new Map<string, SyntenyLink>()
  if (pairIndex && refAccession) {
    for (const r of results) {
      const acc = r.assembly.accession
      const link =
        acc === refAccession
          ? undefined
          : orthologSyntenyLink(pairIndex, r, refAccession)
      if (link) {
        found.set(acc, link)
      }
    }
  }
  return found
}
