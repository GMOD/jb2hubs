// One track plotting NCBI ALFA allele frequency for 12 populations over GRCh38,
// in a `LinearMarkDisplay`, which needs a v5 host. The VCF names each
// population column by its BioSample accession; `name` is that record's title.
import type { Track } from './types.ts'

export const ALFA_TRACK_ID = 'hg38-ALFA_populations'
export const ALFA_MIN_AF = 0.001
export const ALFA_MIN_AN = 20

export const ALFA_POPULATIONS = [
  { biosample: 'SAMN10492705', name: 'Total', color: '#000000' },
  { biosample: 'SAMN10492695', name: 'European', color: '#1f78b4' },
  { biosample: 'SAMN10492698', name: 'African American', color: '#b2182b' },
  { biosample: 'SAMN10492696', name: 'African Others', color: '#ef6548' },
  { biosample: 'SAMN10492703', name: 'African', color: '#fdae61' },
  { biosample: 'SAMN10492697', name: 'East Asian', color: '#00441b' },
  { biosample: 'SAMN10492702', name: 'South Asian', color: '#41ab5d' },
  { biosample: 'SAMN10492701', name: 'Other Asian', color: '#a1d99b' },
  { biosample: 'SAMN10492704', name: 'Asian', color: '#74c476' },
  { biosample: 'SAMN10492699', name: 'Latin American 1', color: '#6a3d9a' },
  { biosample: 'SAMN10492700', name: 'Latin American 2', color: '#cab2d6' },
  { biosample: 'SAMN11605645', name: 'Other', color: '#999999' },
] as const

export const ALFA_VCF =
  'https://ftp.ncbi.nih.gov/snp/population_frequency/latest_release/freq.vcf.gz'

const POPULATION_OF_SAMPLE = `jexl:${JSON.stringify(
  Object.fromEntries(ALFA_POPULATIONS.map(p => [p.biosample, p.name])),
)}[feature.sample]`

export function alfaPopulationsTrack(): Track {
  return {
    type: 'VariantTrack',
    trackId: ALFA_TRACK_ID,
    name: 'NCBI ALFA allele frequency, 12 populations',
    assemblyNames: ['hg38'],
    category: ['Variation and Repeats'],
    adapter: {
      type: 'VcfTabixAdapter',
      vcfGzLocation: { locationType: 'UriLocation', uri: ALFA_VCF },
      index: {
        location: { locationType: 'UriLocation', uri: `${ALFA_VCF}.tbi` },
      },
    },
    displays: [
      {
        type: 'LinearMarkDisplay',
        displayId: `${ALFA_TRACK_ID}-LinearMarkDisplay`,
        height: 300,
        scales: {
          y: { domainMin: 0, domainMax: 1, title: 'ALT allele frequency' },
        },
        marks: [
          {
            mark: 'point',
            transform: [
              { type: 'flatten', field: 'samples', key: 'sample' },
              { type: 'formula', expr: POPULATION_OF_SAMPLE, as: 'population' },
              {
                type: 'formula',
                expr: 'jexl:feature.AC[0] / feature.AN[0]',
                as: 'ALT_AF',
              },
              {
                type: 'filter',
                expr: `jexl:feature.AN[0] >= ${ALFA_MIN_AN} && feature.ALT_AF >= ${ALFA_MIN_AF}`,
              },
            ],
            encoding: {
              y: 'ALT_AF',
              size: 6,
              color: {
                field: 'population',
                scale: 'categorical',
                title: 'population',
                domain: ALFA_POPULATIONS.map(p => p.name),
                range: ALFA_POPULATIONS.map(p => p.color),
              },
            },
          },
        ],
      },
    ],
    metadata: {
      source: 'NCBI dbSNP, Allele Frequency Aggregator (latest release)',
      description: `ALT allele frequency (AC/AN) of each GRCh38 variant, one point per population, read by range request from NCBI's 18 GB ALFA VCF. A population with fewer than ${ALFA_MIN_AN} alleles counted at a site, or a frequency under ${ALFA_MIN_AF}, draws no point, and a multi-allelic site plots its first ALT.`,
    },
  }
}

export function withAlfaPopulations<T extends { tracks: Track[] }>(
  config: T,
  assemblyName: string,
) {
  if (assemblyName === 'hg38') {
    config.tracks.push(alfaPopulationsTrack())
  }
  return config
}
