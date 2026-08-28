// What we know about NCBI RefSeq GFF3, applied to the two tracks that serve it:
// `<db>-ncbiRefSeqGff` on a UCSC golden-path assembly, `<acc>-ncbiGff` on a
// GenArk hub. Both quirks below come from the same property of the file, so they
// share one description of it and one predicate for "is this that track".
//
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

// The name index reads the same file, so it inherits the same problem — and
// there it is worse, because the index has no zoom level to hide behind. A human
// RefSeq GFF3 hands `jbrowse text-index` 63,193 opaque `ID`s (a UUID per `match`,
// an MD5 per `cDNA_match`), 9,131 copies of the string "biological region", and
// ~24,000 `id-GeneID:106783496` from the RefSeqFE regulatory records, none of
// which is a thing anyone types. They also skew the `--prefixSize` heuristic,
// whose whole job is splitting bins of similarly-shaped identifiers.
//
// Two lists, because they answer different questions and only one of them is
// answerable today:
//
// - **INDEX_TYPES is the real statement**: the types that carry a searchable
//   name. It is derived, not guessed — every type with `exon` children in the
//   42,704-file corpus survey (agent-docs/ncbi-gff-feature-type-survey.md §3c),
//   which is exactly gene, pseudogene and the transcript-level vocabulary.
//   Nothing NCBI adds to its 115-type vocabulary can leak past an allow list,
//   which is why this is the shape to prefer.
// - **NON_INDEX_TYPES is what a released `jbrowse text-index` can honor.** The
//   allow list needs `textSearching.indexingFeatureTypesToInclude`, which does
//   not exist in a published `@jbrowse/cli` yet; the deny list has been honored
//   for releases. So this carries the measured offenders — every one of the
//   junk terms counted above — and becomes a redundant subset of the allow list
//   the day the CLI catches up. `CDS` and `exon` are restated because setting
//   the slot REPLACES the CLI's default rather than adding to it.
const INDEX_ATTRIBUTES = ['Name', 'ID', 'gene_synonym']

const INDEX_TYPES = [
  'gene',
  'pseudogene',
  'mRNA',
  'transcript',
  'primary_transcript',
  'lnc_RNA',
  'lncRNA',
  'ncRNA',
  'tRNA',
  'rRNA',
  'snRNA',
  'snoRNA',
  'scaRNA',
  'scRNA',
  'miRNA',
  'piRNA',
  'antisense_RNA',
  'guide_RNA',
  'hammerhead_ribozyme',
  'autocatalytically_spliced_intron',
  'SRP_RNA',
  'RNase_P_RNA',
  'RNase_MRP_RNA',
  'tmRNA',
  'telomerase_RNA',
  'vault_RNA',
  'Y_RNA',
  'V_gene_segment',
  'C_gene_segment',
  'J_gene_segment',
  'D_gene_segment',
  'pseudogenic_rRNA',
  'pseudogenic_tRNA',
]

const NON_INDEX_TYPES = [
  'CDS',
  'exon',
  // one whole-chromosome gbkey=Src row per contig, in all 42,704 genomes
  'region',
  // RefSeqGene and transcript alignments: a bare UUID / MD5 as their only
  // attribute
  'match',
  'cDNA_match',
  // Name is the literal string "biological region" on all 9,131
  'biological_region',
  // RefSeqFE regulatory records, whose only attribute is `ID=id-GeneID:<n>`
  'enhancer',
  'silencer',
  'promoter',
  'protein_binding_site',
  'transcriptional_cis_regulatory_region',
  'nucleotide_motif',
]

/**
 * Give an NCBI GFF track its own text-indexing policy, so `jbrowse text-index`
 * indexes names rather than identifiers. Idempotent, and it merges into whatever
 * `textSearching` the track already carries — `ensureTextSearchAdapters` puts a
 * `textSearchAdapter` there, and dropping that would unhook the track from its
 * own trix.
 *
 * The policy lives on the track rather than in the flags each pipeline passes,
 * for the reason `metadata.skipTextIndex` exists: a per-track answer belongs
 * with the track, where every later re-index finds it and nobody has to
 * remember it at the call site. `text-index` reads both slots in preference to
 * its own flags — verified against the installed @jbrowse/cli 4.1.12, which is
 * what the pipelines run.
 */
export function addNcbiGffTextSearching(track: Track): Track {
  if (!isNcbiGffTrack(track)) {
    return track
  }
  const existing = isRecord(track.textSearching) ? track.textSearching : {}
  return {
    ...track,
    textSearching: {
      ...existing,
      indexingAttributes: INDEX_ATTRIBUTES,
      indexingFeatureTypesToInclude: INDEX_TYPES,
      indexingFeatureTypesToExclude: NON_INDEX_TYPES,
    },
  }
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
