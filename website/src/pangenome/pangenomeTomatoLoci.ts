// Curated examples on /pangenomes/tomato, on Micro-Tom SLM_r2.1, 0-based
// half-open; no bubble crosses a window's edge (measured 2026-11-16 on ada,
// before the upload).
//
// Declined, since the sidecar does not show the paper's allele plainly:
// - EJ2 (ej2w, Soyk et al. 2017): the 564 bp bubble in intron 4 is there, but
//   which panel lines carry ej2w is not settled here
// - TomLoxC promoter and NSGT1: inside 20-48 kb complex bubbles
// - fas and sun: no panel line visibly carries them

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export const TOMATO_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'csr',
    gene: 'CSR / FW11.3',
    names: ['CSR', 'FW11.3'],
    fullName: 'CELL SIZE REGULATOR, a fruit weight gene',
    chrom: 'chr11',
    start: 60_714_600,
    end: 60_721_000,
  },
  {
    id: 'eno',
    gene: 'ENO',
    names: ['ENO'],
    fullName: 'EXCESSIVE NUMBER OF FLORAL ORGANS',
    chrom: 'chr3',
    start: 63_283_700,
    end: 63_287_000,
  },
]

// Carriers read off the sidecar on 2026-11-16.
export const TOMATO_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'csr-d',
    name: 'CSR-D deletion',
    chrom: 'chr11',
    start: 60_716_919,
    end: 60_718_383,
    about:
      "CSR underlies the fruit weight QTL FW11.3. Its derived allele, CSR-D, carries a 1.4 kb deletion that truncates the protein and enlarges the fruit's cells; it arose during domestication and is found in large-fruited cultivated tomato. Micro-Tom has the intact, ancestral allele.",
    inPanel: 'Heinz 1706, M82, TS-60, TS-9 and VF36',
    drawn: [{ gain: false, bp: 1_442, label: 'CSR-D' }],
    citations: [
      {
        label: 'Mu et al. 2017, PLoS Genet',
        url: 'https://doi.org/10.1371/journal.pgen.1006930',
      },
    ],
  },
  {
    id: 'eno-promoter',
    name: 'eno promoter deletion',
    chrom: 'chr3',
    start: 63_285_105,
    end: 63_285_108,
    about:
      "ENO restrains the floral meristem. The eno allele of cultivated tomato carries an 85 bp deletion in its promoter that lowers its expression, so flowers form more organs and fruits more locules, enlarging the fruit. Micro-Tom carries the deletion, so the map draws the wild, undeleted form as a gain.",
    inPanel:
      'no deletion: TS-9, TS-623, both pimpinellifolium lines and all nine other wild species',
    drawn: [{ gain: true, bp: 85, label: 'ENO, no deletion' }],
    citations: [
      {
        label: 'Yuste-Lisbona et al. 2020, PNAS',
        url: 'https://doi.org/10.1073/pnas.1913688117',
      },
    ],
  },
]
