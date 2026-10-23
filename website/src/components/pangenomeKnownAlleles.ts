// Named alleles a pangenome page tells the story of: what each is, what it
// does, who in the panel carries it and the paper that found it. One list per
// dataset, beside its loci, feeds both the page and the "Known alleles" track
// every launch over one opens. `generatePangenomeKnownAlleles.ts` writes the
// track's GFF3 into `pangenome-config/<graph>/`, and `upload.sh` publishes it
// beside the graph config.
//
// Every claim cites a paper whose abstract or text states it, checked on
// PubMed; every span and carrier list was read off the dataset's sidecar.

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { SiteMark } from './pangenomeSvStates.ts'

// How the map draws a haplotype that differs from the reference here, and
// what to call it. Where the reference carries the allele, the drawn change is
// its absence: GRCh38 is Hp2, so a 1.7 kb deletion at HP is Hp1.
export interface DrawnChange {
  gain: boolean
  bp: number
  label: string
}

export interface KnownAllele {
  id: string
  name: string
  // 0-based half-open, on the dataset's reference
  chrom: string
  start: number
  end: number
  // What the allele is, what it does and what the reference carries.
  about: string
  // Who in the panel carries it, for the track, which cannot count; the page
  // counts live from the window's forms.
  inPanel: string
  // Empty where the map draws the allele in pieces: GSTM1's 18 kb deletion
  // sits beside an 18 kb insertion of a copy on 40 haplotypes.
  drawn: DrawnChange[]
  citations: { label: string; url: string }[]
}

export const overlapsAllele = (
  a: Pick<KnownAllele, 'chrom' | 'start' | 'end'>,
  region: { chrom: string; start: number; end: number },
) => a.chrom === region.chrom && a.start < region.end && region.start < a.end

// Walk marks and sidecar marks place an insertion a few bases apart.
const PLACEMENT_SLACK_BP = 1000

// The same 10% as `similar` in pangenomePanels.ts, which keeps KIT's 6.9 kb
// long allele apart from its 6.0 kb intermediate one.
const SIZE_TOLERANCE = 0.1

const gainOf = (m: SiteMark) =>
  m.kind === 'insertion' || m.kind === 'duplication'
    ? true
    : m.kind === 'deletion'
      ? false
      : m.kind === 'replacement' && !m.net
        ? !!m.gain
        : undefined

// The drawn change a mark is, if it is one.
export function drawnChangeOf(m: SiteMark, alleles: readonly KnownAllele[]) {
  const gain = gainOf(m)
  if (gain === undefined) {
    return undefined
  }
  for (const a of alleles) {
    if (
      a.start - PLACEMENT_SLACK_BP <= m.end &&
      m.start <= a.end + PLACEMENT_SLACK_BP
    ) {
      const drawn = a.drawn.find(
        d =>
          d.gain === gain &&
          Math.abs(d.bp - m.bp) <= SIZE_TOLERANCE * Math.max(d.bp, m.bp),
      )
      if (drawn) {
        return { allele: a, drawn }
      }
    }
  }
  return undefined
}

const KNOWN_ALLELES_FILE = 'known-alleles.gff3'

// The bucket copy beside the graph config, CORS-open as the config is.
export const knownAllelesUrl = (dataset: PangenomeDataset) =>
  new URL(KNOWN_ALLELES_FILE, dataset.graphBrowser.configUrl).href

// The committed copy `upload.sh` publishes there, relative to `website/`:
// `pangenome-config/<graph>/` mirrors the bucket's `pangenome/<graph>/`.
export function knownAllelesFile(dataset: PangenomeDataset) {
  const graph = new URL(dataset.graphBrowser.configUrl).pathname.split('/')[2]
  return `pangenome-config/${graph}/${KNOWN_ALLELES_FILE}`
}

export const knownAllelesTrackId = (dataset: PangenomeDataset) =>
  `${dataset.id}-known-alleles`

// The track a launch opens where a known allele is in its window, as an
// inline session track so the reference configs need not carry it.
export function knownAllelesTrack(
  dataset: PangenomeDataset,
  region: { chrom: string; start: number; end: number },
) {
  return dataset.knownAlleles.some(a => overlapsAllele(a, region))
    ? {
        type: 'FeatureTrack',
        trackId: knownAllelesTrackId(dataset),
        name: 'Known alleles',
        assemblyNames: [dataset.reference.assembly],
        adapter: { type: 'Gff3Adapter', uri: knownAllelesUrl(dataset) },
      }
    : undefined
}

// GFF3's reserved characters, and the comma, which would split a value into a
// list.
const escapeGff = (value: string) =>
  value.replace(
    /[%;=&,\t\n]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  )

export const gffAttributes = (pairs: [string, string | string[]][]) =>
  pairs
    .map(
      ([k, v]) =>
        `${k}=${(Array.isArray(v) ? v : [v]).map(escapeGff).join(',')}`,
    )
    .join(';')

// One `sequence_alteration` per allele. JBrowse's feature details link a url
// inside a value, so each citation names its paper and then its url.
export function knownAllelesGff3(alleles: readonly KnownAllele[]) {
  const lines = [...alleles]
    .sort((a, b) =>
      a.chrom === b.chrom ? a.start - b.start : a.chrom < b.chrom ? -1 : 1,
    )
    .map(a =>
      [
        a.chrom,
        'jb2hubs',
        'sequence_alteration',
        a.start + 1,
        a.end,
        '.',
        '.',
        '.',
        gffAttributes([
          ['ID', a.id],
          ['Name', a.name],
          ['Note', a.about],
          ['in_panel', a.inPanel],
          ['citation', a.citations.map(c => `${c.label} ${c.url}`)],
        ]),
      ].join('\t'),
    )
  return `##gff-version 3\n${lines.join('\n')}\n`
}
