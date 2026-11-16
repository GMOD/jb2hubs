// Curated examples on /pangenomes/dog, on canFam4, 0-based half-open; no bubble
// crosses a window's edge (measured 2026-11-16 on ada, before the upload).
//
// Declined, since the sidecar does not show the paper's allele plainly:
// - FGF4 retrogenes on CFA18 and CFA12 (Parker et al. 2009, Brown et al. 2017):
//   no 5 kb insertion's carriers match the breeds known to carry them
// - MITF piebald SINE (Karlsson et al. 2007): the nearby 200 bp insertions are
//   carried by wolves and dingoes too

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export const DOG_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'rspo2',
    gene: 'RSPO2',
    names: ['RSPO2'],
    fullName: 'R-spondin 2, the furnishings gene',
    chrom: 'chr13',
    start: 8_821_000,
    end: 8_825_500,
  },
]

// Carriers read off the sidecar on 2026-11-16.
export const DOG_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'rspo2-furnishings',
    name: 'RSPO2 furnishings insertion',
    chrom: 'chr13',
    start: 8_823_200,
    end: 8_823_225,
    about:
      "Furnishings, the moustache and eyebrows of wire-haired breeds, come from a 167 bp insertion in RSPO2's 3' UTR that raises its expression. canFam4, a German Shepherd, lacks it.",
    inPanel: 'Cairn_CA611 and MixedBreed_N25-0066',
    drawn: [{ gain: true, bp: 141, label: 'furnishings' }],
    citations: [
      {
        label: 'Cadieu et al. 2009, Science',
        url: 'https://doi.org/10.1126/science.1177808',
      },
    ],
  },
]
