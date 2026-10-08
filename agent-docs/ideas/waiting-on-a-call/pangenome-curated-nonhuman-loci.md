---
name: pangenome-curated-nonhuman-loci
description:
  Replace the "Most variable" bubbles on /pangenomes/mouse, bovine and
  arabidopsis with curated textbook loci (Nnt, Ly49, KIT white head, POLLED,
  RPP5, RPM1, the Chr4 knob inversion). Every window here is measured against
  the published graph; pick which to keep and how to name them.
---

# Curated example loci for the mouse, cattle and Arabidopsis graphs

`/pangenomes/mouse`, `/pangenomes/bovine` and `/pangenomes/arabidopsis` offer
derived examples: the coarse tier's bubbles ranked by segment count, labelled
"Gm10439 +10", "LOC790886", "AT4G05215 +19". HPRC offers 22 curated loci with a
name and a one-line description (`PANGENOME_LOCI` in
`website/src/components/pangenomeLoci.ts`). The three lists below give the
non-human datasets the same thing. Nothing here is wired in: each array is
paste-ready for a `loci:` field in `website/src/components/pangenomeDataset.ts`,
and the decisions at the end are the user's.

## How each window was measured

Gene coordinates come from the UCSC REST API's `ncbiRefSeq` track (mm39,
bosTau9) and from mygene.info species 3702 (TAIR10), all on 2026-10-08. Graph
structure comes from ranged `tabix` reads of each dataset's published
`.bubbles.bed.gz`, `.alleles.bed.gz` and `.tier10000.segs.bed.gz`, plus
`.vcf.gz` for cattle and `syri_regions.bed.gz` for Arabidopsis.

The table columns are: **bubbles** (rows of the bubble index in the window),
**SV** (allele rows of 50 bp or more), **≥1 kb** (allele rows of 1 kb or more),
**largest** (the biggest single allele row) and **top bubble** (segments in the
window's largest coarse-tier bubble, blank where no bubble reaches the tier's 10
kb floor). Every window is 0-based half-open and no bubble crosses either edge,
the rule AMY1's comment states for HPRC.

Three traps cost time and are worth knowing before re-measuring:

- The bubble and tier files name sequences in PanSN (`mm39#0#chr4`,
  `bosTau9#0#chr6`, `TAIR10#1#Chr4`); the allele files and the VCF use the bare
  name. A bare-name query against the bubble index returns nothing, which reads
  as a flat graph.
- `tabix` on a url writes the `.tbi` into the working directory. Run it from a
  scratch directory.
- The mouse and Arabidopsis graphs record no carriage. The allele file's
  `firstSeenIn` is the first assembly, in build order, to add the node, so it
  can rule a strain out (anything before it lacks the allele) and never rules
  one in. Only cattle, through the VCF, says which breed carries what.

Citations are from memory except Milia et al. 2025, which a web search
confirmed. Check the others before quoting them on a page.

## Mouse (GRCm39 / mm39)

The reference is C57BL/6J, so a mutation B6J is famous for shows as an insertion
in the other strains.

| id          | window                        | kb  | bubbles | SV  | ≥1 kb | largest     | top bubble | what the graph shows                                                                                                       |
| ----------- | ----------------------------- | --- | ------- | --- | ----- | ----------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `nlrp1`     | chr11:70,970,500-71,120,500   | 150 | 29      | 47  | 19    | 105,079 ins | 86 seg     | Nlrp1a and Nlrp1b; one bubble at 71,091,857-71,119,017 whose longest path is 169.7 kb                                      |
| `ly49`      | chr6:130,060,000-130,175,000  | 115 | 10      | 41  | 8     | 63,580 del  | 80 seg     | Klra8 (Ly49h), Klra14-ps, Klra9; a 63.6 kb deletion path over 130,102,193-130,165,773                                      |
| `h2-d`      | chr17:35,470,000-35,601,000   | 131 | 23      | 75  | 24    | 80,522 del  | 231 seg    | H2-D1 through H2-Q4; a 73.5 kb insertion at 35,513,788, between H2-D1 and H2-Q1, and a 231-segment Q bubble                |
| `nnt`       | chr13:119,460,000-119,560,000 | 100 | 17      | 18  | 3     | 16,458 ins  | 9 seg      | One 16.5 kb insertion at 119,511,984 inside Nnt: the exons B6J lacks. First seen in CAST, so absent from the B6J T2T build |
| `mx1`       | chr16:97,230,000-97,280,000   | 50  | 4       | 4   | 1     | 3,446 ins   |            | One 3.4 kb insertion at 97,253,670 inside Mx1: the exons the laboratory strains lack                                       |
| `dilute`    | chr9:75,065,000-75,125,000    | 60  | 6       | 6   | 1     | 8,732 ins   |            | One 8.7 kb insertion at 75,097,804 inside Myo5a, first seen in DBA/2J: the Emv3 provirus                                   |
| `nonagouti` | chr2:154,800,000-154,900,000  | 100 | 21      | 23  | 5     | 14,705 del  | 3 seg      | A 14.7 kb deletion at 154,856,868-154,871,573 in agouti intron 1; RepeatMasker reads the interval as one LTR-bounded ERV   |

Verified alternates, any of which can swap in:

| id      | window                       | kb  | bubbles | SV  | ≥1 kb | largest     | top bubble | what the graph shows                                                                              |
| ------- | ---------------------------- | --- | ------- | --- | ----- | ----------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `rd1`   | chr5:108,520,000-108,590,000 | 70  | 19      | 20  | 1     | 8,647 ins   |            | One 8.6 kb insertion at 108,538,277 in Pde6b intron 1, first seen in FVB/NJ: the Xmv28 provirus   |
| `mup20` | chr4:61,860,000-61,990,000   | 130 | 4       | 16  | 12    | 81,139 del  | 30 seg     | Mup20 (darcin) inside one 101.6 kb bubble. The central Mup array is flat; see the rejections      |
| `raet1` | chr10:21,955,000-22,093,000  | 138 | 28      | 31  | 13    | 73,095 ins  | 25 seg     | Raet1e and a 73.1 kb insertion at 22,040,880. H60b sits in the next bubble, 190 kb wide           |
| `h2-ea` | chr17:34,500,500-34,620,000  | 120 | 30      | 41  | 4     | 7,833 del   |            | Class II, H2-Aa to Btnl1. A 630 bp insertion at 34,565,710, 2.1 kb 5' of annotated H2-Ea          |
| `amy2`  | chr3:113,098,000-113,335,000 | 237 | 2       | 43  | 18    | 127,314 del | 121 seg    | Amy2a1 to Amy2a5 in one 225 kb bubble. Wider than the cap because the bubble is; coarse tier only |

What varies, and where the claim comes from:

- **Nlrp1.** Nlrp1b alleles decide macrophage sensitivity to anthrax lethal
  toxin, and the locus holds one to three paralogs depending on strain (Boyden
  and Dietrich 2006, Nat Genet 38:240; Lilue et al. 2018, Nat Genet 50:1574).
- **Ly49.** Ly49h (Klra8) confers resistance to mouse cytomegalovirus and is
  missing from BALB/c; the cluster's gene count differs between B6, 129, BALB/c
  and NOD (Lee et al. 2001, Nat Genet 28:42; Brown et al. 2001, Science
  292:934).
- **H2-D.** The b haplotype (B6) has H2-D alone where d (BALB/c, DBA/2) has H2-D
  and H2-L, and the Q region's gene count differs by haplotype (Weiss et al.
  1984, Nature 310:650).
- **Nnt.** C57BL/6J carries a deletion of Nnt exons 7-11 that C57BL/6NJ and
  every other strain lack (Toye et al. 2005, Diabetologia 48:675; Freeman et al.
  2006, Diabetes 55:2153).
- **Mx1.** Most laboratory strains carry Mx1 with exons 9-11 deleted;
  wild-derived strains carry the intact, influenza-resistant gene (Staeheli et
  al. 1988, Mol Cell Biol 8:4518).
- **Dilute.** The DBA/2J dilute coat colour is an ecotropic MuLV (Emv3) inside
  Myo5a (Jenkins et al. 1981, Nature 293:370).
- **Nonagouti.** B6 is black because a retroviral insertion sits in the first
  intron of agouti; agouti strains (129, CBA, C3H, the wild-derived ones) lack
  it (Bultman et al. 1994, Genes Dev 8:481).
- **rd1.** Retinal degeneration in FVB, C3H and CBA is an Xmv28 provirus in
  Pde6b intron 1 with a nonsense mutation beside it (Bowes et al. 1993, PNAS
  90:2955).
- **H2-Ea.** B6 expresses no I-E because 627 bp of the Ea promoter and first
  exon are deleted (Mathis et al. 1983, PNAS 80:273). The 630 bp insertion is
  the right size, 2.1 kb from where RefSeq starts the truncated transcript.

```ts
export const MOUSE_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'nlrp1',
    gene: 'Nlrp1a / Nlrp1b',
    fullName: 'NLRP1 inflammasome paralogs',
    // Starts before the bubble at 70,970,673 and ends after the 86-segment one
    // at 71,119,017. 13 kb of Nlrp1b and all of Nlrp1c-ps are outside: the next
    // bubble (71,122,331-71,130,898) would put the window over 150 kb.
    chrom: 'chr11',
    start: 70_970_500,
    end: 71_120_500,
  },
  {
    id: 'ly49',
    gene: 'Ly49 (Klra)',
    fullName: 'NK cell receptor cluster',
    // Klra8 (Ly49h) through Klra9: the two bubbles at 130,066,306-130,098,956
    // and 130,102,193-130,165,773. The whole cluster runs past 700 kb.
    chrom: 'chr6',
    start: 130_060_000,
    end: 130_175_000,
  },
  {
    id: 'h2-d',
    gene: 'H2-D / H2-Q',
    fullName: 'MHC class I, D and Q regions',
    // Ends before the 173 kb bubble that starts at 35,602,362.
    chrom: 'chr17',
    start: 35_470_000,
    end: 35_601_000,
  },
  {
    id: 'nnt',
    gene: 'Nnt',
    fullName: 'The C57BL/6J exon deletion',
    chrom: 'chr13',
    start: 119_460_000,
    end: 119_560_000,
  },
  {
    id: 'mx1',
    gene: 'Mx1',
    fullName: 'Influenza resistance, deleted in laboratory strains',
    chrom: 'chr16',
    start: 97_230_000,
    end: 97_280_000,
  },
  {
    id: 'dilute',
    gene: 'Myo5a (dilute)',
    fullName: 'DBA/2J coat colour provirus',
    // The 3' 60 kb of Myo5a, around the insertion at 75,097,804. The gene is
    // 156 kb and its 5' end holds an unrelated 18 kb insertion.
    chrom: 'chr9',
    start: 75_065_000,
    end: 75_125_000,
  },
  {
    id: 'nonagouti',
    gene: 'a (nonagouti)',
    fullName: 'The retroviral insertion that makes C57BL/6 black',
    chrom: 'chr2',
    start: 154_800_000,
    end: 154_900_000,
  },
]

// Alternates, verified the same way.
const MOUSE_ALTERNATES: PangenomeLocus[] = [
  {
    id: 'rd1',
    gene: 'Pde6b (rd1)',
    fullName: 'Retinal degeneration provirus',
    chrom: 'chr5',
    start: 108_520_000,
    end: 108_590_000,
  },
  {
    id: 'mup20',
    gene: 'Mup20',
    fullName: 'Major urinary proteins, the darcin end',
    // The one Mup bubble the graph resolves. The central array
    // (chr4:60,720,000-61,300,000) is flat.
    chrom: 'chr4',
    start: 61_860_000,
    end: 61_990_000,
  },
  {
    id: 'raet1',
    gene: 'Raet1',
    fullName: 'NKG2D ligand cluster',
    chrom: 'chr10',
    start: 21_955_000,
    end: 22_093_000,
  },
  {
    id: 'h2-ea',
    gene: 'H2 class II',
    fullName: 'MHC class II, H2-A and H2-E',
    chrom: 'chr17',
    start: 34_500_500,
    end: 34_620_000,
  },
  {
    id: 'amy2',
    gene: 'Amy2a',
    fullName: 'Pancreatic amylase cluster',
    // One 225 kb bubble (113,101,029-113,326,354), so the window is wider than
    // MAX_DETAIL_WINDOW_BP and draws from the coarse tier.
    chrom: 'chr3',
    start: 113_098_000,
    end: 113_335_000,
  },
]
```

### Mouse loci rejected

- **Mup cluster, central array** (chr4:60,720,000-61,300,000). 580 kb holds 14
  bubbles, 13 SV alleles and no coarse-tier bubble. The array's genes are on one
  path, minigraph's collapse of a near-identical tandem array. `mup20` above is
  the edge that resolves.
- **Skint cluster** (chr4:111,850,000-112,300,000, Skint1 to Skint9). 14
  bubbles, largest allele 6.5 kb, no tier bubble. The bubbles further along
  (113.5-113.8 Mb) all sit inside the 520 kb Skint5 gene.
- **Glo1 copy-number variant** (chr17:30,700,000-31,300,000). 126 bubbles and
  nothing over 6.4 kb. The 475 kb duplication A/J and C3H carry is not in the
  graph.
- **H2-Ea as its own example.** The 630 bp insertion is real and the right size,
  but 630 bp in a 120 kb window is not a picture. Kept as the class II
  alternate.

## Cattle (ARS-UCD1.2 / bosTau9)

The reference is a Hereford cow. The VCF gives a carrier list for every row
here, in column order ANG BIS BRA BSW GAU HIG NEL OBV PIE SIM YAK.

| id        | window                      | kb  | bubbles | SV  | ≥1 kb | largest     | top bubble | what the graph shows                                                                                                             |
| --------- | --------------------------- | --- | ------- | --- | ----- | ----------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `kit`     | chr6:70,085,000-70,200,000  | 115 | 5       | 7   | 3     | 20,621 del  | 9 seg      | A bubble at 70,099,508-70,120,129, 47 kb 5' of KIT. Ten assemblies delete 20.6 kb; Simmental alone carries 37.5 kb               |
| `polled`  | chr1:2,400,000-2,460,000    | 60  | 3       | 3   | 0     | 273 ins     |            | chr1:2,429,329, 7 bp replaced by 209 bp, in Angus and nobody else: the Celtic POLLED allele                                      |
| `asip`    | chr13:63,600,000-63,700,000 | 100 | 7       | 7   | 2     | 8,403 del   |            | An 8.4 kb deletion at 63,639,812-63,648,215, which RepeatMasker reads as one L1_BT. Angus, Brahman and Highland keep it          |
| `bola-dq` | chr23:25,570,000-25,715,000 | 145 | 34      | 72  | 19    | 66,353 del  | 78 seg     | BoLA-DQA2, DQB, DQA5: a 70.2 kb site with five alternate alleles (3.8 to 55.7 kb), every assembly non-reference                  |
| `cathl`   | chr22:51,560,000-51,650,000 | 90  | 14      | 13  | 4     | 13,410 ins  | 9 seg      | Between CATHL1 and CATHL4: Brahman, bison and gaur add 6.7 kb, Nellore 13.4 kb, yak 4.1 kb; all six taurine breeds are reference |
| `bola-i`  | chr23:28,605,000-28,750,000 | 145 | 45      | 83  | 18    | 58,427 del  | 148 seg    | Classical class I (JSP.1, BOLA): one 60.8 kb bubble of 148 segments                                                              |
| `defb`    | chr27:6,341,000-7,210,000   | 869 | 4       | 227 | 105   | 320,496 del | 1,113 seg  | The whole beta-defensin cluster is one 856 kb bubble with paths up to 2.0 Mb. Wider than the cap because the bubble is           |

`cathl`'s largest allele is the VCF's (reference 1,172 bp, Nellore 14,582 bp);
the allele file splits that site and reports 6,715 bp.

Verified alternates:

| id     | window                     | kb  | bubbles | SV  | ≥1 kb | largest     | top bubble | what the graph shows                                          |
| ------ | -------------------------- | --- | ------- | --- | ----- | ----------- | ---------- | ------------------------------------------------------------- |
| `lyz`  | chr5:44,205,000-44,345,000 | 140 | 11      | 27  | 9     | 69,315 del  | 32 seg     | The ruminant stomach lysozyme cluster, three tier bubbles     |
| `ulbp` | chr9:84,665,000-84,795,000 | 130 | 6       | 14  | 4     | 109,893 del | 25 seg     | The ULBP/RAET1 NKG2D-ligand cluster, one 110 kb deletion path |

What varies, and where the claim comes from:

- **KIT.** White-headed breeds carry extra copies of a 14.3 kb repeat 66 kb
  upstream of KIT, more in Hereford than in Simmental, and the Hereford
  reference under-assembles it (Milia et al. 2025, Genome Res 35:1041). The
  graph has the site: Simmental's path is 16.9 kb longer than the reference's
  and holds a 14.3 kb inserted segment, and every colour-headed assembly is 20.6
  kb shorter.
- **POLLED.** The Celtic allele is a 212 bp duplication replacing 10 bp, net
  +202 bp (Medugorac et al. 2012, PLoS ONE 7:e39477). The graph's record is net
  +202 bp and Angus is the one polled breed in the panel.
- **ASIP.** A full-length LINE inserted in ASIP's 5' region gives the gene an
  alternative promoter (Girardot et al. 2006, Pigment Cell Res 19:346). The
  RefSeq transcript starts at the inserted element's first base.
- **BoLA-DQ.** The number of DQA and DQB genes differs between BoLA haplotypes,
  one pair or two (Andersson and Rask 1988, Immunogenetics 27:110).
- **Cathelicidins.** CATHL4 is at higher copy number in indicine cattle
  (Bickhart et al. 2012, Genome Res 22:778).
- **BoLA class I.** Haplotypes carry between one and three classical class I
  genes out of six (Birch et al. 2006, Immunogenetics 58:670).
- **Beta-defensins.** The chr27 cluster is the most copy-number-variable immune
  locus in cattle (Bickhart et al. 2012, as above).

```ts
export const BOVINE_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'kit',
    gene: 'KIT',
    fullName: 'White head of Hereford and Simmental',
    // The repeat 47-67 kb 5' of KIT, and the gene's first 33 kb. KIT itself
    // (70,166,692-70,254,049) is flat.
    chrom: 'chr6',
    start: 70_085_000,
    end: 70_200_000,
  },
  {
    id: 'polled',
    gene: 'POLLED',
    fullName: 'Celtic hornless allele, carried by Angus',
    // A 202 bp event at chr1:2,429,329. The window is narrow so it is not lost.
    chrom: 'chr1',
    start: 2_400_000,
    end: 2_460_000,
  },
  {
    id: 'asip',
    gene: 'ASIP',
    fullName: 'Agouti, with a LINE in its 5′ end',
    chrom: 'chr13',
    start: 63_600_000,
    end: 63_700_000,
  },
  {
    id: 'bola-dq',
    gene: 'BoLA-DQ',
    fullName: 'MHC class II, DQ gene duplication',
    // DQA2 through the bubbles 5' of DRB3. DRB3 (25,723,690-25,734,819) is
    // outside: including it takes the window to 158 kb.
    chrom: 'chr23',
    start: 25_570_000,
    end: 25_715_000,
  },
  {
    id: 'cathl',
    gene: 'CATHL',
    fullName: 'Cathelicidin cluster',
    chrom: 'chr22',
    start: 51_560_000,
    end: 51_650_000,
  },
  {
    id: 'bola-i',
    gene: 'BoLA class I',
    fullName: 'MHC class I',
    chrom: 'chr23',
    start: 28_605_000,
    end: 28_750_000,
  },
  {
    id: 'defb',
    gene: 'DEFB',
    fullName: 'Beta-defensin cluster',
    // One bubble, chr27:6,345,695-7,202,077. A 150 kb cut would start and end
    // inside it, so the window is the bubble and draws from the coarse tier.
    chrom: 'chr27',
    start: 6_341_000,
    end: 7_210_000,
  },
]

// Alternates, verified the same way.
const BOVINE_ALTERNATES: PangenomeLocus[] = [
  {
    id: 'lyz',
    gene: 'LYZ',
    fullName: 'Stomach lysozyme cluster',
    chrom: 'chr5',
    start: 44_205_000,
    end: 44_345_000,
  },
  {
    id: 'ulbp',
    gene: 'ULBP',
    fullName: 'NKG2D ligand cluster',
    chrom: 'chr9',
    start: 84_665_000,
    end: 84_795_000,
  },
]
```

### Cattle loci rejected

- **KIT colour-sided and the KIT gene body.** KIT (chr6:70,166,692-70,254,049)
  holds no allele of 1 kb or more. The colour-sided allele is a chr6-to-chr29
  translocation in Belgian Blue and Brown Swiss lines, which a per-chromosome
  minigraph build cannot hold. The upstream repeat is the KIT story this graph
  has.
- **POLLED, Friesian allele.** The 80 kb duplication at chr1:2.6 Mb is a
  Holstein allele and no Holstein is in the panel. chr1:2,380,000-2,480,000
  holds seven SVs, none over 407 bp.
- **MC1R, PRLR (slick), PLAG1.** Point mutations and small indels; not looked
  for in a graph of 50 bp and larger events.
- **WC1 / CD163L1** (chr5:102.0-103.0 Mb). Structure is there (a 245-segment,
  184 kb bubble at 102,828,111, flagged as holding an inversion), but no
  published breed difference backs a description.

## Arabidopsis (TAIR10)

The reference is Col-0, and Col-0.6909 is also the first accession in the graph.

| id        | window                     | kb    | bubbles | SV    | ≥1 kb | largest    | top bubble | what the graph shows                                                                                                                      |
| --------- | -------------------------- | ----- | ------- | ----- | ----- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `rpp5`    | Chr4:9,475,000-9,570,000   | 95    | 13      | 153   | 74    | 33,256 ins | 1,164 seg  | RPP4, SNC1, RPP5, RLM3: one 70 kb bubble of 1,164 segments whose longest path is 385 kb                                                   |
| `rpp1`    | Chr3:16,080,000-16,230,000 | 150   | 56      | 197   | 66    | 98,745 ins | 1,323 seg  | RPP1 and its paralogs: a 192-segment bubble at RPP1 and a 1,323-segment one at 16,192,931 with paths to 485 kb                            |
| `rpm1`    | Chr3:2,205,000-2,250,000   | 45    | 17      | 18    | 5     | 3,680 del  |            | A 3.7 kb deletion at 2,225,720-2,229,594 that removes RPM1 (2,225,855-2,229,555) and nothing else                                         |
| `s-locus` | Chr4:11,340,000-11,405,000 | 65    | 7       | 17    | 12    | 13,353 del | 116 seg    | One 32.7 kb bubble of 116 segments between PUB8 and ARK3, paths to 107.7 kb                                                               |
| `flc`     | Chr5:3,165,000-3,195,000   | 30    | 11      | 13    | 7     | 12,876 ins | 3 seg      | In FLC intron 1: insertions of 4,824 and 1,190 bp and deletions of 2,307 and 1,542 bp. The 12.9 kb insertion is 13 kb outside the gene    |
| `mam`     | Chr5:7,690,000-7,735,000   | 45    | 23      | 33    | 7     | 6,680 del  | 41 seg     | A 41-segment bubble inside MAM1 and a 6.7 kb deletion between MAM1 and MAM3                                                               |
| `knob`    | Chr4:1,558,000-2,839,000   | 1,281 | 446     | 1,116 | 381   | 61,460 ins | 214 seg    | No bubble spans the inversion. SyRI calls it in 24 of 26 accessions, Chr4:1,612,605-2,782,621 at its widest; Col-0 and KBS-Mac-74 lack it |

Verified alternates:

| id     | window                     | kb  | bubbles | SV  | ≥1 kb | largest    | top bubble | what the graph shows                                                     |
| ------ | -------------------------- | --- | ------- | --- | ----- | ---------- | ---------- | ------------------------------------------------------------------------ |
| `rps5` | Chr1:4,135,000-4,157,000   | 22  | 10      | 13  | 5     | 6,065 ins  | 8 seg      | A 3.8 kb deletion at 4,143,735-4,147,738 over RPS5 (4,144,257-4,147,939) |
| `maf`  | Chr5:25,970,000-26,010,000 | 40  | 7       | 18  | 10    | 15,980 ins | 41 seg     | MAF2 to MAF5: a 41-segment bubble at MAF2/MAF3 with a 16.0 kb insertion  |
| `aop`  | Chr4:1,335,000-1,365,000   | 30  | 7       | 22  | 9     | 22,087 ins | 46 seg     | AOP3 and AOP2: a 46-segment bubble and a 22.1 kb insertion beside it     |
| `acd6` | Chr4:8,280,000-8,313,000   | 33  | 13      | 26  | 10    | 5,902 ins  | 47 seg     | A 47-segment bubble over ACD6 (8,294,165-8,299,195)                      |
| `rps4` | Chr5:18,295,000-18,340,000 | 45  | 8       | 21  | 9     | 13,774 del | 73 seg     | RPS4 and RRS1 inside one 34.1 kb bubble                                  |

What varies, and where the claim comes from:

- **RPP5.** Col-0 has eight RPP5 homologs here and Landsberg has ten, in a
  different arrangement (Noël et al. 1999, Plant Cell 11:2099).
- **RPP1.** RPP1 is a family of TIR-NLR genes whose copy number and identity
  differ by accession (Botella et al. 1998, Plant Cell 10:1847).
- **RPM1.** The textbook presence/absence polymorphism: susceptible accessions
  have 98 bp where resistant ones have the 3.7 kb gene, and both forms are old
  (Grant et al. 1998, PNAS 95:15843; Stahl et al. 1999, Nature 400:667).
- **S locus.** A. thaliana selfs because SRK and SCR are broken, and the
  accessions keep three diverged pseudo-haplogroups, A, B and C (Tsuchimatsu et
  al. 2010, Nature 464:1342).
- **FLC.** Independent transposon insertions in FLC's first intron make
  early-flowering alleles; Landsberg's is 1.2 kb (Michaels et al. 2003, PNAS
  100:10102; Gazzani et al. 2003, Plant Physiol 132:1107).
- **MAM.** Accessions carry MAM1, MAM2 or both at this locus, which sets
  glucosinolate chain length (Kroymann et al. 2003, PNAS 100:14587).
- **Knob.** A 1.17 Mb paracentric inversion moved pericentromeric
  heterochromatin into the short arm of chromosome 4, making the hk4S knob
  (Fransz et al. 2016, Plant J 88:159). Col-0 is the inverted form, which is why
  SyRI reports nearly every other accession as inverted.

```ts
export const ARABIDOPSIS_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'rpp5',
    gene: 'RPP5 / RPP4',
    fullName: 'Downy mildew resistance cluster',
    // The whole bubble (Chr4:9,481,498-9,551,536) and RLM3 beside it.
    chrom: 'Chr4',
    start: 9_475_000,
    end: 9_570_000,
  },
  {
    id: 'rpp1',
    gene: 'RPP1',
    fullName: 'RPP1 resistance gene cluster',
    // RPP1 through the last paralog, AT3G44670. The first, AT3G44400, is in a
    // separate bubble at 16,038,577 that would take the window to 192 kb.
    chrom: 'Chr3',
    start: 16_080_000,
    end: 16_230_000,
  },
  {
    id: 'rpm1',
    gene: 'RPM1',
    fullName: 'A resistance gene present or absent',
    chrom: 'Chr3',
    start: 2_205_000,
    end: 2_250_000,
  },
  {
    id: 's-locus',
    gene: 'S locus',
    fullName: 'Self-incompatibility locus (SRK / SCR)',
    chrom: 'Chr4',
    start: 11_340_000,
    end: 11_405_000,
  },
  {
    id: 'flc',
    gene: 'FLC',
    fullName: 'Flowering Locus C',
    chrom: 'Chr5',
    start: 3_165_000,
    end: 3_195_000,
  },
  {
    id: 'mam',
    gene: 'MAM1 / MAM3',
    fullName: 'Glucosinolate chain-length locus',
    chrom: 'Chr5',
    start: 7_690_000,
    end: 7_735_000,
  },
  {
    id: 'knob',
    gene: 'hk4S knob',
    fullName: 'Chromosome 4 knob inversion',
    // SyRI's widest call (Chr4:1,612,605-2,782,621) with flank, cut between
    // bubbles. 1.28 Mb, so the coarse tier and the SyRI rows; the graph has no
    // bubble for the inversion itself.
    chrom: 'Chr4',
    start: 1_558_000,
    end: 2_839_000,
  },
]

// Alternates, verified the same way.
const ARABIDOPSIS_ALTERNATES: PangenomeLocus[] = [
  {
    id: 'rps5',
    gene: 'RPS5',
    fullName: 'A resistance gene present or absent',
    chrom: 'Chr1',
    start: 4_135_000,
    end: 4_157_000,
  },
  {
    id: 'maf',
    gene: 'MAF2–MAF5',
    fullName: 'MADS Affecting Flowering cluster',
    chrom: 'Chr5',
    start: 25_970_000,
    end: 26_010_000,
  },
  {
    id: 'aop',
    gene: 'AOP2 / AOP3',
    fullName: 'Glucosinolate side-chain locus',
    chrom: 'Chr4',
    start: 1_335_000,
    end: 1_365_000,
  },
  {
    id: 'acd6',
    gene: 'ACD6',
    fullName: 'Accelerated Cell Death 6',
    chrom: 'Chr4',
    start: 8_280_000,
    end: 8_313_000,
  },
  {
    id: 'rps4',
    gene: 'RPS4 / RRS1',
    fullName: 'Paired resistance genes',
    chrom: 'Chr5',
    start: 18_295_000,
    end: 18_340_000,
  },
]
```

### Arabidopsis loci rejected

- **FRI** (Chr4:266,000-274,000). The two textbook lesions are not in this
  graph: Col-0's is a 16 bp deletion, under minigraph's size floor, and
  Landsberg's 376 bp deletion needs Landsberg, which is not among the 26. What
  the window does hold is a 1,268 bp deletion at the gene's 3' end
  (271,394-272,662) with no published name.
- **RPP8** (Chr5:17,450,000-17,480,000). 36 SVs, but bubbles cross both edges of
  the 30 kb window tried, and RPM1 and RPS5 tell the presence/absence story with
  one clean event each.
- **RPP7 cluster** (Chr1:21,680,000-21,780,000). A 257-segment bubble runs
  21,738,364-21,841,126, so the cluster needs over 150 kb. Not pursued with RPP5
  and RPP1 already in.

## What surprised

- **Minigraph resolves NLR clusters in Arabidopsis and collapses the mouse Mup
  array.** RPP5 is 1,164 segments in 70 kb; the central 580 kb of Mup is 14
  bubbles. Divergent paralogs get bubbles, near-identical tandem copies do not.
- **The curated Arabidopsis loci are already in the derived list, unnamed.**
  RPP5 is the derived entry "AT4G02965 +23" and RPP1's distal bubble is
  "AT3G44620 +6". The ranking finds the right places; the labels hide them.
- **Single-event loci are the clearest pictures and the ranking never finds
  them.** Nnt, Mx1, dilute, rd1, POLLED, ASIP and RPM1 are each one allele in a
  quiet window, with a segment count of 3 to 9.
- **The cattle reference is the odd one out at KIT and ASIP.** Hereford carries
  the longer allele at both, so the breeds read as deletions.
- **Arabidopsis SV density is far higher than the other two.** The knob's 1.28
  Mb holds 1,116 SV alleles; a typical 100 kb mouse window holds 20 to 70.

## What a human should decide

1. **Which seven per dataset.** The first table per dataset is the proposal; the
   alternates are interchangeable. Mouse has four single-event loci (Nnt, Mx1,
   dilute, nonagouti) and three complex ones; swap `rd1` or `mup20` in if that
   balance is wrong.
2. **Whether a window past `MAX_DETAIL_WINDOW_BP` belongs among the examples.**
   `defb` (869 kb), `knob` (1.28 Mb) and `amy2` (237 kb) draw from the coarse
   tier, where every HPRC example opens on segment lanes. `knob` also depends on
   the SyRI rows to show anything recognisable as an inversion.
3. **Whether `polled` is too small to offer.** It is the best-known locus on the
   cattle list and the graph has it exactly, in the right breed, but it is 202
   bp. Check how a 60 kb window with three SVs draws before keeping it.
4. **Naming.** `gene` is the chip label. Open choices: "Ly49 (Klra)" or "Klra";
   "a (nonagouti)" or "Agouti"; "Myo5a (dilute)" or "Dilute"; "POLLED" or
   "Polled"; "hk4S knob" or "Chr4 knob"; "S locus" or "SRK / SCR".
5. **Curated only, or curated then derived.** `pangenomeExamples` already lists
   curated loci before derived ones, so a dataset can carry both. The "Most
   variable" heading then needs to cover only the derived tail.
6. **Whether the descriptions may name a strain or breed.** "Carried by Angus"
   and "DBA/2J coat colour provirus" say more than HPRC's descriptions do. The
   cattle VCF backs the breed claims; the mouse ones rest on the literature,
   because that graph records no carriage.

Wiring is small once decided: export the arrays from `pangenomeLoci.ts`, put
them ahead of `derivedLoci(...)` in each dataset's `loci`, and run
`pnpm check-pangenome-launches`. A visible change to these pages is owed to the
jbrowse-components tutorials.
