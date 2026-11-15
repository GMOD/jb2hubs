// Curated examples on /pangenomes/rice, on AGIS-1.0, 0-based half-open; no
// bubble crosses a window's edge (measured 2026-11-15 on ada, before the
// upload).
//
// Declined, since the sidecar does not show the paper's allele or no text
// states it:
// - PROG1: no 110 kb RPAD insertion for the three O. rufipogon members
// - Sub1A: no insertion between Sub1C and Sub1B, and no paper gives its span
// - DPL1: Kasalath, 9311 and four SL lines carry 520 bp inside the gene, but
//   only GenBank AB534829 calls it a transposon; Mizuta et al. 2010's abstract
//   says no more than that DPL1 is disrupted in indica
// - Sc: 9311's +67 kb is one of 19 copy-number forms in a single bubble

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export const RICE_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    // A bare visit opens the first example, so it is the clearest map.
    id: 'sd1',
    gene: 'sd1',
    names: ['SD1', 'GA20ox2', 'OsGA20ox2'],
    fullName: 'SEMI-DWARF 1, the Green Revolution gene',
    chrom: 'chr1',
    start: 39_008_000,
    end: 39_020_000,
  },
  {
    id: 'qsw5',
    gene: 'qSW5 / GW5',
    names: ['qSW5', 'GW5', 'GSE5'],
    fullName: 'grain width QTL on chromosome 5',
    chrom: 'chr5',
    start: 5_374_000,
    end: 5_390_000,
  },
  {
    id: 'dep1',
    gene: 'DEP1',
    names: ['DEP1', 'qPE9-1', 'DN1'],
    fullName: 'DENSE AND ERECT PANICLE 1',
    // Ends before CW15's 91 kb insertion at 20,797,899.
    chrom: 'chr9',
    start: 20_786_000,
    end: 20_797_800,
  },
  {
    id: 'gl7',
    gene: 'GL7 / GW7',
    names: ['GL7', 'GW7', 'SLG7'],
    fullName: 'grain length on chromosome 7',
    chrom: 'chr7',
    start: 24_880_000,
    end: 24_903_000,
  },
  {
    id: 'pstol1',
    gene: 'Pup1 / PSTOL1',
    names: ['PSTOL1', 'Pup1'],
    fullName: 'phosphorus uptake 1, absent from the reference',
    // Seven forms of 46 to 89 kb share the insertion point, so the window
    // spans the bubbles either side of it.
    chrom: 'chr12',
    start: 15_809_500,
    end: 15_905_400,
  },
]

// Carriers read off the sidecar on 2026-11-15.
export const RICE_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'sd1-d',
    name: 'sd1-d deletion',
    chrom: 'chr1',
    start: 39_013_075,
    end: 39_013_458,
    about:
      "SD1 encodes an oxidase of gibberellin biosynthesis, and the semi-dwarf sd1 alleles of the Green Revolution disable it. Dee-geo-woo-gen's is a 383 bp deletion from the middle of exon 1 to upstream of exon 2, which shifts the frame; IR64 carries it. AGIS-1.0 has the intact, tall allele.",
    inPanel: 'IR64, ZH8015, FNA, NJ11, J4155S, CX20, SL084, SL102 and SL177',
    drawn: [{ gain: false, bp: 383, label: 'sd1-d' }],
    citations: [
      {
        label: 'Monna et al. 2002, DNA Res',
        url: 'https://doi.org/10.1093/dnares/9.1.11',
      },
      {
        label: 'Sasaki et al. 2002, Nature',
        url: 'https://doi.org/10.1038/416701a',
      },
      {
        label: 'Bhuvaneswari et al. 2020, Plants',
        url: 'https://doi.org/10.3390/plants9091198',
      },
    ],
  },
  {
    id: 'qsw5-alleles',
    name: 'qSW5 deletions',
    chrom: 'chr5',
    start: 5_379_833,
    end: 5_380_337,
    about:
      "A deletion upstream of the grain-width gene qSW5/GW5 lowers its expression and widens the grain. It has three alleles: Kasalath's, with no deletion, an indica allele with a 950 bp deletion, and Nipponbare's 1,212 bp deletion. AGIS-1.0 is a Nipponbare, so the map draws the other two as gains.",
    inPanel:
      'no deletion: Kasalath, IR64, 9311 and 21 more; 950 bp deletion: 11, among them the weedy CX20, YZ-2 and PI653432',
    drawn: [
      { gain: true, bp: 1212, label: 'qSW5, no deletion' },
      { gain: true, bp: 262, label: 'qSW5, 950 bp deletion' },
    ],
    citations: [
      {
        label: 'Shomura et al. 2008, Nat Genet',
        url: 'https://doi.org/10.1038/ng.169',
      },
      {
        label: 'Lee et al. 2015, Rice',
        url: 'https://doi.org/10.1186/s12284-015-0066-1',
      },
      {
        label: 'Duan et al. 2017, Mol Plant',
        url: 'https://doi.org/10.1016/j.molp.2017.03.009',
      },
    ],
  },
  {
    id: 'dep1',
    name: 'dep1 truncation',
    chrom: 'chr9',
    start: 20_795_121,
    end: 20_795_758,
    about:
      'The erect-panicle dep1 allele, common to many Chinese high-yielding varieties, truncates its protein: a 637 bp stretch of the fifth exon is replaced by 12 bp. The Italian cultivar Balilla carries it, and so does every erect- or semi-erect-panicle japonica among the Chinese varieties resequenced. AGIS-1.0 has the non-erect allele.',
    inPanel: 'Balilla, Changxianggeng1813 and Wuyunjing8',
    drawn: [{ gain: false, bp: 625, label: 'dep1' }],
    citations: [
      {
        label: 'Huang et al. 2009, Nat Genet',
        url: 'https://doi.org/10.1038/ng.352',
      },
      {
        label: 'Ueda et al. 2025, Rice',
        url: 'https://doi.org/10.1186/s12284-025-00756-w',
      },
    ],
  },
  {
    id: 'gl7-dup',
    name: 'GL7 duplication',
    chrom: 'chr7',
    start: 24_895_210,
    end: 24_895_211,
    about:
      'A tandem duplication of a 17.1 kb segment at GL7 raises its expression and lowers that of a nearby negative regulator, which lengthens the grain and improves its appearance. AGIS-1.0 has one copy.',
    inPanel: 'SL039 and FNA',
    drawn: [{ gain: true, bp: 17_100, label: 'GL7 duplication' }],
    citations: [
      {
        label: 'Wang et al. 2015, Nat Genet',
        url: 'https://doi.org/10.1038/ng.3346',
      },
    ],
  },
  {
    id: 'pstol1',
    name: 'Pup1 insertion (PSTOL1)',
    chrom: 'chr12',
    start: 15_866_609,
    end: 15_866_648,
    about:
      "Kasalath's Pup1 locus, for tolerance of phosphorus-poor soil, holds the protein kinase gene PSTOL1, which the reference genome and other phosphorus-starvation-intolerant modern varieties lack. It sits in an insertion of about 90 kb, a presence/absence polymorphism that spans cultivated, weedy and wild rice. Other members insert 46 to 77 kb at the same point; which of them hold PSTOL1 is not read here.",
    inPanel: 'Kasalath and SL190; IR64 has no insertion here',
    drawn: [{ gain: true, bp: 89_000, label: 'Pup1 (Kasalath)' }],
    citations: [
      {
        label: 'Gamuyao et al. 2012, Nature',
        url: 'https://doi.org/10.1038/nature11346',
      },
      {
        label: 'Vigueira et al. 2016, BMC Plant Biol',
        url: 'https://doi.org/10.1186/s12870-016-0783-7',
      },
    ],
  },
]
