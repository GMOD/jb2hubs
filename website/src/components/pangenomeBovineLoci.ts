// Curated examples on /pangenomes/bovine, on ARS-UCD1.2 (bosTau9), 0-based
// half-open. Each window was measured against the published bubble, allele and
// tier files and the callset on 2026-10-08, and no bubble crosses either edge.
// The numbers and the alternates are in
// agent-docs/reference/PANGENOME_PAGES.md.
//
// Measured and declined:
// - KIT gene body (chr6:70,166,692-70,254,049): no allele of 1 kb or more. The
//   color-sided allele is a chr6-to-chr29 translocation, which a
//   per-chromosome graph cannot hold.
// - The Friesian POLLED allele, an 80 kb duplication at
//   chr1:2,629,113-2,709,240 (OMIA): the sidecar has no large event there, and
//   the panel has no Holstein. The Celtic allele is the `polled` example.
// - WC1 / CD163L1 (chr5:102.0-103.0 Mb): a 245-segment, 184 kb bubble at
//   102,828,111, with no published difference to describe it by.

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export const BOVINE_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'kit',
    gene: 'KIT',
    fullName: 'KIT white spotting and white head',
    // Both known alleles upstream of KIT, the spotting one at 70,052,678 and
    // the white-head repeat at 70,099,508-70,120,129, and the gene's first
    // 33 kb. KIT itself is flat.
    chrom: 'chr6',
    start: 70_050_000,
    end: 70_200_000,
  },
  {
    id: 'polled',
    gene: 'POLLED',
    fullName: 'Celtic polled allele (hornless)',
    // One record at chr1:2,429,329, 7 bp replaced by 209 bp, which only Angus
    // carries. The graph folds every variant narrower than 10 px, so the 60 kb
    // window this replaced folded it at 325 bp and drew one diagonal segment.
    // At 1.9 kb it draws as a loop at any usable width.
    chrom: 'chr1',
    start: 2_428_400,
    end: 2_430_300,
  },
  {
    id: 'asip',
    gene: 'ASIP',
    fullName: 'Agouti signalling protein',
    // An 8.4 kb deletion at 63,639,812-63,648,215, in the gene's 5' end: the
    // L1-BT element the reference carries, absent from eight assemblies.
    chrom: 'chr13',
    start: 63_600_000,
    end: 63_700_000,
  },
  {
    id: 'bola-dq',
    gene: 'BoLA-DQ',
    fullName: 'MHC class II, DQ region',
    // DQA2 through the bubbles 5' of DRB3: a 70.2 kb site with five alternate
    // alleles of 3.8 to 55.7 kb. DRB3 (25,723,690-25,734,819) is outside,
    // because including it takes the window to 158 kb.
    chrom: 'chr23',
    start: 25_570_000,
    end: 25_715_000,
  },
  {
    id: 'cathl',
    gene: 'CATHL',
    fullName: 'Cathelicidin cluster',
    // Insertions of 4.1 to 13.4 kb between CATHL1 and CATHL4.
    chrom: 'chr22',
    start: 51_560_000,
    end: 51_650_000,
  },
  {
    id: 'bola-i',
    gene: 'BoLA class I',
    fullName: 'MHC class I',
    // One 60.8 kb bubble of 148 segments.
    chrom: 'chr23',
    start: 28_605_000,
    end: 28_750_000,
  },
  {
    id: 'defb',
    gene: 'DEFB',
    fullName: 'Beta-defensin cluster',
    // One bubble of 1,113 segments, chr27:6,345,695-7,202,077. A 150 kb cut
    // would start and end inside it, so the window is the bubble and draws
    // from the coarse tier.
    chrom: 'chr27',
    start: 6_341_000,
    end: 7_210_000,
  },
]

// Carriers read off the sidecar on 2026-10-23. ARS-UCD1.2 is a horned
// Hereford.
export const BOVINE_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'polled-celtic',
    name: 'Celtic polled (Pc)',
    // OMIA's g.[2429327_2429336del;2429109_2429320dupins]
    chrom: 'chr1',
    start: 2_429_108,
    end: 2_429_336,
    about:
      'A 202 bp insertion-deletion: 212 bp duplicated in place of 10 bp. One copy stops horns growing, in Angus and many other European breeds; polled Holstein-Friesians carry a different allele. ARS-UCD1.2, a horned Hereford, lacks it.',
    inPanel: 'Angus alone',
    drawn: [{ gain: true, bp: 200, label: 'Celtic polled' }],
    citations: [
      {
        label: 'Medugorac et al. 2012, PLoS One',
        url: 'https://doi.org/10.1371/journal.pone.0039477',
      },
      { label: 'OMIA 000483-9913', url: 'https://omia.org/OMIA000483/9913/' },
    ],
  },
  {
    id: 'kit-spotting',
    name: 'KIT white-spotting deletion',
    chrom: 'chr6',
    start: 70_052_678,
    end: 70_052_679,
    about:
      'A 6.9 kb deletion 114 kb upstream of KIT causes the white spotting of Holstein-Friesian cattle. Herefords nearly all carry it, and so does ARS-UCD1.2, so an assembly drawn with an insertion here keeps the ancestral sequence, long (6.9 kb) or intermediate (6.0 kb).',
    inPanel:
      'Angus, Nellore and Simmental share the deletion; Original Braunvieh and Piedmontese carry the intermediate allele, the other six the long one',
    drawn: [
      { gain: true, bp: 6900, label: 'KIT long (ancestral)' },
      { gain: true, bp: 6000, label: 'KIT intermediate' },
    ],
    citations: [
      {
        label: 'Jivanji et al. 2025, Sci Adv',
        url: 'https://doi.org/10.1126/sciadv.adt5913',
      },
    ],
  },
  {
    id: 'kit-white-head',
    name: 'KIT white-head duplication',
    chrom: 'chr6',
    start: 70_099_507,
    end: 70_120_129,
    about:
      'Tandem copies of a 14.3 kb repeat 66 kb upstream of KIT go with the white head of Hereford, Simmental and Fleckvieh cattle. ARS-UCD1.2 is a Hereford, but assembled fewer copies than Herefords carry.',
    inPanel:
      'Simmental, the other white-headed breed, carries 17 kb more; the other ten assemblies 21 kb less',
    drawn: [
      { gain: true, bp: 17_000, label: 'more KIT repeats' },
      { gain: false, bp: 21_000, label: 'fewer KIT repeats' },
    ],
    citations: [
      {
        label: 'Milia et al. 2025, Genome Res',
        url: 'https://doi.org/10.1101/gr.279064.124',
      },
    ],
  },
  {
    id: 'asip-l1bt',
    name: 'L1-BT at ASIP',
    // UCSC rmsk's L1_BT is 63,639,816-63,647,702.
    chrom: 'chr13',
    start: 63_639_811,
    end: 63_648_215,
    about:
      "ARS-UCD1.2 carries a full-length L1-BT retrotransposon in ASIP's 5' region. An L1-BT inserted 5' of ASIP drives extra ASIP transcripts in Normande cattle and may cause their brindle coat (the Abr allele).",
    inPanel:
      'Angus, Brahman and Highland carry it; the other eight assemblies lack it',
    drawn: [{ gain: false, bp: 8400, label: 'no L1-BT at ASIP' }],
    citations: [
      {
        label: 'Girardot et al. 2006, Pigment Cell Res',
        url: 'https://doi.org/10.1111/j.1600-0749.2006.00312.x',
      },
    ],
  },
]
