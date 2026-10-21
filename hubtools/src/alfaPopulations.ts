// One track plotting NCBI ALFA allele frequency for 12 populations over GRCh38,
// in a `LinearMarkDisplay`, which needs a v5 host.
import type { Track } from './types.ts'

export const ALFA_RELEASE = '20260205170148'
export const ALFA_TRACK_ID = 'hg38-ALFA_populations'
export const ALFA_MIN_AF = 0.001

export const ALFA_POPULATIONS = [
  { id: 'GLB', color: '#000000' },
  { id: 'EUR', color: '#1f78b4' },
  { id: 'AFA', color: '#b2182b' },
  { id: 'AFO', color: '#ef6548' },
  { id: 'AFR', color: '#fdae61' },
  { id: 'EAS', color: '#00441b' },
  { id: 'SAS', color: '#41ab5d' },
  { id: 'OAS', color: '#a1d99b' },
  { id: 'ASN', color: '#74c476' },
  { id: 'LAC', color: '#6a3d9a' },
  { id: 'LEN', color: '#cab2d6' },
  { id: 'OTR', color: '#999999' },
] as const

const BASE = `https://ftp.ncbi.nih.gov/snp/population_frequency/TrackHub/${ALFA_RELEASE}/hg38`

export const ALFA_ALT_AF =
  "jexl:parseFloat(split(split(feature.frequency,'ALT_AF(')[1],'=')[1])"

export function alfaPopulationsTrack(): Track {
  return {
    type: 'FeatureTrack',
    trackId: ALFA_TRACK_ID,
    name: 'NCBI ALFA allele frequency, 12 populations',
    assemblyNames: ['hg38'],
    category: ['Variation and Repeats'],
    adapter: {
      type: 'MultiWiggleAdapter',
      subadapters: ALFA_POPULATIONS.map(({ id }) => ({
        type: 'BigBedAdapter',
        source: id,
        bigBedLocation: {
          locationType: 'UriLocation',
          uri: `${BASE}/ALFA_${id}.bb`,
        },
      })),
    },
    displays: [
      {
        type: 'LinearMarkDisplay',
        displayId: `${ALFA_TRACK_ID}-LinearMarkDisplay`,
        height: 300,
        fetchSizeLimit: 30_000_000,
        filter: [`${ALFA_ALT_AF} >= ${ALFA_MIN_AF}`],
        scales: {
          y: { domainMin: 0, domainMax: 1, title: 'ALT allele frequency' },
        },
        marks: [
          {
            mark: 'point',
            transform: [{ type: 'formula', expr: ALFA_ALT_AF, as: 'ALT_AF' }],
            encoding: {
              y: 'ALT_AF',
              size: 6,
              color: {
                field: 'source',
                scale: 'categorical',
                domain: ALFA_POPULATIONS.map(p => p.id),
                range: ALFA_POPULATIONS.map(p => p.color),
              },
            },
          },
        ],
      },
    ],
    metadata: {
      source: 'NCBI dbSNP, Allele Frequency Aggregator (release 5)',
      description:
        'ALT allele frequency of each GRCh38 variant, one point per population, read by range request from 12 bigBeds of about 19 GB each. Variants under 0.001 in every population are hidden, and a multi-allelic site plots its first ALT.',
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
