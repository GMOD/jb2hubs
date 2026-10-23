// Public catalogs of variants with a phenotype, which a launch opens under the
// known alleles: the GWAS Catalog on HPRC, OMIA's cattle variants on the bovine
// graph. Where the known alleles name the one famous change in a window, a
// catalog shows what else in it has been tied to a trait.

import { isWide } from './pangenomeLoci.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

export interface CatalogTrack {
  trackId: string
  name: string
  adapter: Record<string, unknown>
}

// UCSC's gwasCatalog autoSql, so the feature details name the trait, the paper
// and the p-value instead of numbering the columns.
const GWAS_CATALOG_COLUMNS = [
  'chrom',
  'chromStart',
  'chromEnd',
  'name',
  'pubMedID',
  'author',
  'pubDate',
  'journal',
  'title',
  'trait',
  'initSample',
  'replSample',
  'region',
  'genes',
  'riskAllele',
  'riskAlFreq',
  'pValue',
  'pValueDesc',
  'orOrBeta',
  'ci95',
  'platform',
  'cnv',
]

// The copy the hg38 config already mirrors beside itself.
export const GWAS_CATALOG: CatalogTrack = {
  trackId: 'hprc-gwas-catalog',
  name: 'GWAS Catalog (NHGRI-EBI)',
  adapter: {
    type: 'BedTabixAdapter',
    bedGzLocation: { uri: 'https://jbrowse.org/ucsc/hg38/gwasCatalog.bed.gz' },
    index: {
      indexType: 'CSI',
      location: { uri: 'https://jbrowse.org/ucsc/hg38/gwasCatalog.bed.gz.csi' },
    },
    columnNames: GWAS_CATALOG_COLUMNS,
  },
}

// `generatePangenomeOmia.ts` writes it, and `upload.sh` publishes it beside the
// bovine graph config.
export const OMIA_CATTLE: CatalogTrack = {
  trackId: 'bovine-omia-variants',
  name: 'OMIA causal variants',
  adapter: {
    type: 'Gff3Adapter',
    uri: 'https://jbrowse.org/pangenome/bovine-arsucd12/omia-variants.gff3',
  },
}

const CATALOG_ROW_HEIGHT_PX = 60

// The catalog rows a launch opens and the session tracks that define them.
// None past MAX_DETAIL_WINDOW_BP, where a catalog is a smear of marks.
export function catalogRows(
  dataset: PangenomeDataset,
  region: { start: number; end: number },
) {
  const catalogs = isWide(region) ? [] : (dataset.catalogs ?? [])
  return {
    tracks: catalogs.map(c => ({
      trackId: c.trackId,
      type: 'LinearBasicDisplay',
      height: CATALOG_ROW_HEIGHT_PX,
    })),
    sessionTracks: catalogs.map(c => ({
      type: 'FeatureTrack',
      trackId: c.trackId,
      name: c.name,
      assemblyNames: [dataset.reference.assembly],
      adapter: c.adapter,
    })),
  }
}
