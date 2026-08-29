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
// menu's "Show only genes"), but it is not set here: it would hide exactly the
// `match`/`cDNA_match`/regulatory records the label chain below exists to make
// readable, which would defeat the point of adding one. A reader who wants
// genes-only can still flip it on from the track menu themselves.
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
// A deny list, not an allow list, and that is not the shape to prefer — an
// allow list is the statement that survives NCBI adding a 116th type to its
// vocabulary, and one was written here (every type with `exon` children in the
// 42,704-file corpus survey, agent-docs/ncbi-gff-feature-type-survey.md §3c).
// It was removed on 2026-08-28 because **nothing reads it**:
// `indexingFeatureTypesToInclude` is not a slot in core's `baseTrackConfig`
// (4.3.0) and `@jbrowse/cli`'s indexing-utils (4.2.1) destructures only
// `indexingFeatureTypesToExclude` and `indexingAttributes`. Written for a CLI
// that would catch up, it instead shipped 33 dead type names into 44,681
// configs — 74 UCSC, the rest GenArk — that every reader fetches. Bring it
// back when a release honors it, not before.
//
// So NON_INDEX_TYPES carries the measured offenders — every one of the junk
// terms counted above. `CDS` and `exon` are restated because setting the slot
// REPLACES the CLI's default rather than adding to it.
const INDEX_ATTRIBUTES = ['Name', 'ID', 'gene_synonym']

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

// What to draw on a record NCBI left unnamed, and what to show on hover.
//
// The order is derived attribute by attribute from a real human RefSeq GFF3
// (1,976,126 records), not guessed:
//
// - `standard_name` FIRST, and it has to beat `name`: all 9,131
//   `biological_region` rows carry `Name=biological region` — the same useless
//   literal — while their `standard_name` is "conserved acetylation island
//   sequence 30 enhancer". It is also the only label V/C/J/D_gene_segment
//   (581 of 587 on V) and `recombination_feature` (553 of 568) have, neither of
//   which carries a `Name` at all. The one other type carrying both is `exon`
//   (1,391 of 984,360), a subfeature whose text the gene glyph draws, so
//   putting it first costs nothing.
// - `name` — gene, pseudogene, mRNA, transcript, lnc_RNA, snoRNA: the normal
//   case, unchanged.
// - `gene` — miRNA (3,172 of 3,172) and tRNA (660 of 660) have no `Name`.
// - `Note` — the RefSeqFE descriptive text: silencer 3,154/3,156,
//   protein_binding_site 1,305/1,326 ("USF-binding E box motif"),
//   nucleotide_motif 580/580, and the recombination regions.
// - `function` — enhancer 5,415/5,559 ("enhancer in Jurkat T cells"); some
//   enhancers carry this and no Note.
// - `regulatory_class` — a regulatory row with neither at least says what it is.
// - `target` — `match` and `cDNA_match` carry NOTHING else: no Name, no gene,
//   no Note, not even a gbkey. `Target=NG_004148.3 1 1144 +` names the
//   RefSeqGene or transcript aligned there, which is the entire content of the
//   feature, so its first token is the label. This is what replaces the bare
//   UUID and MD5.
//
// Verified end to end in a browser against the real hg38 config, at the BRCA1
// window — 116 top-level records, of which 33 `match`, 27 `biological_region`,
// 26 `protein_binding_site`, 25 `enhancer`, 22 `gene`. Before: 33 UUIDs, 51
// `id-GeneID:…`, 27 "biological region". After: none of those, 33 `NG_…`
// accessions, and labels reading "NANOG-H3K27ac-H3K4me1 hESC enhancer",
// "ATAC-STARR-seq lymphoblastoid active region 12236", "BRCA1P1 intergenic
// recombination region". This is what every reader sees by default, since
// `showOnlyGenes` is not set — see the note above.
//
// EVERY KEY IS LOWERCASE, and that is not cosmetic. `get(feature, key)` folds
// the FILE's tag but compares it against `key` verbatim, so a query that spells
// the GFF3 attribute as GFF3 does — `Note`, `Target` — matches nothing and
// returns undefined with no error. Measured 2026-08-28 on hg38 in a browser:
// `get(feature,'Target')` labelled 0 of the window's 33 `match` records,
// `get(feature,'target')` labelled all 33. The chain still "worked" either way,
// because `||` just moved on, which is exactly why this is worth stating.
const LABEL =
  "jexl:get(feature,'standard_name')" +
  "||get(feature,'name')" +
  "||get(feature,'gene')" +
  "||get(feature,'note')" +
  "||get(feature,'function')" +
  "||get(feature,'regulatory_class')" +
  "||split(get(feature,'target')||'',' ')[0]"

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
      indexingFeatureTypesToExclude: NON_INDEX_TYPES,
    },
  }
}

/**
 * Give an NCBI GFF track the label/hover fallback chain the records without a
 * `Name` need, leaving every other track alone. Idempotent, so a re-run over an
 * already-enhanced config is a no-op.
 *
 * Deliberately does not set `showOnlyGenes`: that would hide the very records
 * this label chain exists to make readable, so nothing would ever show it. A
 * reader who wants genes-only can still turn it on from the track menu.
 *
 * `labels`/`mouseover` are two of `deriveFeatureDisplay`'s DERIVED_KEYS, which
 * it drops and rewrites on the entry with this same displayId. There is no
 * conflict today — that deriver runs on tracks carrying `metadata.ucsc` and an
 * NCBI GFF track has none — and if one ever did, this runs second and wins,
 * consistently on every re-run rather than alternating.
 */
export function addNcbiGffLabelDisplay(track: Track): Track {
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
            ? {
                ...d,
                labels: { name: LABEL },
                mouseover: LABEL,
              }
            : d,
        )
      : // First, not appended: pickDisplayForView takes the first declared
        // display the view supports, so this has to hold the position the track
        // type's own default would have.
        [
          {
            type: BASIC,
            displayId,
            labels: { name: LABEL },
            mouseover: LABEL,
          },
          ...existing,
        ],
  }
}
