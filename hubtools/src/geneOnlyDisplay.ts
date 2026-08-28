// An NCBI RefSeq GFF3 gene track drawn with everything the file carries is not
// readable, and the reason is not density — it is that most of what NCBI puts at
// the top level of that file is not a gene and carries no name.
//
// Measured on a human RefSeq GFF3 (1,976,126 records, 136,543 of them top-level,
// i.e. no `Parent=` and so drawn as their own row):
//
//   gene + pseudogene                      48,705   35.7%
//   match + cDNA_match                     63,193   46.3%
//   RefSeqFE regulatory + biological_region 24,344   17.8%
//   region (one whole-chromosome row each)     301    0.2%
//
// The 46.3% are RefSeqGene and transcript alignments carrying `ID=` and nothing
// else — an RFC-4122 UUID on a `match`, a 32-char MD5 on a `cDNA_match` — which
// is where the bare-hex labels come from, and they redraw at exon granularity the
// very transcripts the track already draws properly under their gene. The 17.8%
// are real, citation-backed annotation (enhancers, silencers, TF binding sites)
// that NCBI never gives a `Name=`: an `enhancer` labels itself
// `id-GeneID:106783496`, and every one of the 9,131 `biological_region` rows is
// literally `Name=biological region`, with the informative text left in
// `standard_name=`.
//
// It is worst exactly where a reader looks. In the 326 kb around BRCA1: 116
// top-level rows, 17 of them genes — a 5.8:1 ratio against the genome-wide 1.8:1,
// because RefSeqFE density tracks how well-studied a locus is.
//
// `showOnlyGenes` is jbrowse's own answer to this (the config form of the track
// menu's "Show only genes"), and on this data it costs nothing: NOT ONE
// transcript-level record is ever top-level — zero rows of mRNA, transcript,
// lnc_RNA, miRNA, exon or CDS lack a `Parent=` — so every isoform, exon and CDS
// stays attached to its gene. The regulatory features are a click away in the
// same menu rather than gone, which is why this is a default view and not a
// filter on the file.
import { isRecord } from './util.ts'

import type { Track } from './types.ts'

const BASIC = 'LinearBasicDisplay'

// The same NCBI GFF3, under each pipeline's name for it: `<db>-ncbiRefSeqGff` on
// a UCSC golden-path assembly (74 of 239 configs), `<acc>-ncbiGff` on a GenArk
// hub. Matched as a whole trackId segment and paired with the adapter the
// pipeline built for it, so a trackDb that happens to name something similarly
// is left alone — same narrowing as repeatClassPartitionField.
function isNcbiGffTrack(track: Track) {
  return (
    track.type === 'FeatureTrack' &&
    isRecord(track.adapter) &&
    track.adapter.type === 'Gff3TabixAdapter' &&
    /(^|-)(ncbiRefSeqGff|ncbiGff)$/.test(track.trackId)
  )
}

/**
 * Set `showOnlyGenes` on an NCBI GFF track's basic display, leaving every other
 * track alone. Idempotent, so a re-run over an already-enhanced config is a
 * no-op.
 *
 * Unlike `addRepeatClassDisplay` this needs no env gate, and the difference is
 * which half of the entry is new. That one names a display TYPE the released
 * host lacks, which fails the track config's MST union and takes the whole track
 * down with a fatal. This names `LinearBasicDisplay`, which every supported host
 * has had since v4.0.0, and adds one undeclared SLOT to it — which MST drops from
 * the snapshot in silence. Measured 2026-08-28 against
 * jbrowse.org/code/jb2/{v4.0.0,latest,main} with the real hg38 config served to
 * the hosted app: no fatal on any of the three, and the track renders exactly as
 * it does today on the two released ones (`showOnlyGenes` reads back undefined)
 * while `main` drops the 116 rows around BRCA1 to its 17 genes.
 */
export function addGeneOnlyDisplay(track: Track): Track {
  if (!isNcbiGffTrack(track)) {
    return track
  }
  const displayId = `${track.trackId}-${BASIC}`
  const existing: unknown[] = Array.isArray(track.displays)
    ? track.displays
    : []
  const found = existing.some(d => isRecord(d) && d.displayId === displayId)
  return {
    ...track,
    displays: found
      ? existing.map(d =>
          isRecord(d) && d.displayId === displayId
            ? { ...d, showOnlyGenes: true }
            : d,
        )
      : // First, not appended: pickDisplayForView takes the first declared
        // display the view supports, so this has to hold the position the track
        // type's own default would have.
        [{ type: BASIC, displayId, showOnlyGenes: true }, ...existing],
  }
}
