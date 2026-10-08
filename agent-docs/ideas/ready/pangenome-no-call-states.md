---
name: pangenome-no-call-states
description:
  'Split the HPRC sidecar''s no-call state into "on another route through the
  enclosing site" and "not placed", from raw.vcf.gz, and restore the parent
  snarls vcfbub popped. Retires KNOWN_UNPLACED, hemizygousChromosomes and "skips
  N variant sites"; measured on defb, nphp1, FLNA, AMY1 and UGT2B17.'
---

# The sidecar's no call is two states, and the release's raw callset says which

Measured 2026-10-08 from a workstation, with ranged reads only. Nothing here is
built. `agent-docs/reference/PANGENOME_PORTAL.md` ("A form with no call can be
made of haplotypes the graph does not place") holds the earlier lane-by-lane
measurement that this one agrees with and does not repeat.

## The finding

The sv-states sidecar packs the wave callset, and vcfbub removed from that
callset every snarl whose reference allele exceeds 100 kb, keeping its children.
A haplotype that takes a route through such a snarl that bypasses a child has no
call at the child, and the record that would say what the haplotype does instead
is the removed parent. The release's `raw.vcf.gz` still has those parents. At a
parent, a placed haplotype has an allele with a length, and an unplaced one is
missing.

So the fix is in the sidecar and needs no second file: restore each removed
parent as a row, and write a no call under a parent that calls the haplotype as
a new state `_`, leaving `.` for a haplotype no ancestor calls.

The haplotype walks, which looked like the natural source, give the wrong answer
for a deletion. At AMY1, 247 of the 255 haplotypes in the no-call form step from
reference 103,620,893 straight to 103,715,097, over 94,204 bp, yet only 52 of
the 255 are 94 kb shorter than GRCh38. HG00126#1, 122 bp shorter than the
reference, makes that step twice, once on each strand. The other copies sit on
non-reference nodes and on second passes over the same reference nodes, so a
jump over reference bases is not a deletion wherever the graph collapses copies.

## What each case is

Windows are the curated examples'. "Parent" is the top-level record of
`raw.vcf.gz` over the site. "Walks" is the walk-indexed files' answer.

| Case                                             | Answer                                          | Evidence                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| defb, HG00097#1, chr8:7,850,001-7,930,000        | not placed                                      | No walk row between 7,733,248 and 8,010,377. Of the form's 395, 210 have no reference step in the window, 181 are placed for 66,356 to 66,670 bp and stop at 7,916,670, and 4 cross it. The only parent is a 5,193,122 bp snarl (7,091,419-12,284,540) that 461 of 462 are missing at.               |
| nphp1, HG00544#1, chr2:110,080,001-110,210,000   | not placed, sequence present                    | Its walk ends at reference 109,975,357 and resumes at 110,276,210 on the same contig, 301,341 bp of contig for 300,853 bp of reference: the graph clipped the stretch. Missing at all 220 top-level records; the form's 5 all lack an aligned run in the window and a call at the 346,081 bp parent. |
| FLNA, HG00126#1, chrX:154,340,001-154,440,000    | not placed, no chrX                             | No walk row in 154,271,744-154,533,888 and missing at all 537 top-level records. The same holds for all 116 of its form; HG00126#2 is called at all 537.                                                                                                                                             |
| AMY1, form of 255, chr1:103,610,001-103,760,000  | placed, and mostly the reference's three copies | At the 176,380 bp parent (103,556,262-103,732,641): 165 within 142 bp of the reference length, 52 are 94 kb shorter, 15 are 2.8 kb longer, 5 are 22 kb longer, 6 are 22 to 73 kb shorter, 12 missing. The form lumps them because all bypass the same 64 nested sites.                               |
| UGT2B17, form of 229, chr4:68,530,001-68,680,000 | deletion, 117,313 bp                            | All 229 carry a -117 kb allele at the 117,314 bp parent (68,508,114-68,625,427), and all 229 walks step from 68,508,114 straight to 68,625,427. The positive control passes both ways.                                                                                                               |

## What can say where a haplotype is placed

Sizes are `content-length` on 2026-10-08. "Release" is
`https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38`.

| Source                                                                       | Size                                          | Says                                                                                                                                                                           | Ranged read                                                                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Release `.wave.vcf.gz`, the sidecar's input                                  | 2,291,014,302                                 | Nothing more than the sidecar. `GT` is its only FORMAT field, no INFO field marks a spanning deletion, and 0 of 3,533 records at UGT2B17 carry a `*` allele.                   | 3.5 MB of text for 150 kb in 2.3 s                                                                                                  |
| Release `.raw.vcf.gz`                                                        | 24,211,218,014                                | The parents vcfbub removed, with `LV`, `PS` and `AT`. A placed haplotype has an allele; its length is the net size change over the whole snarl.                                | Build only: 20 to 97 MB of text per 280 to 350 kb in 2.8 to 4.5 s; one parent by a 1 bp region is 27 to 92 MB in 3.7 to 4.8 s       |
| Release `.pgbi.vcf.gz`, the variants launch's callset                        | 3,508,874,231                                 | Not the parents: its longest allele in chr4:68,500,001-68,680,000 is 6,096 bp, and it has no record in the defb window.                                                        | 1.2 to 2.3 MB per window                                                                                                            |
| `jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38.{walks,nodes,links}.bed.gz`      | 9,456,947,318 + 3,305,457,973 + 5,487,697,154 | Every walk's steps under 64 kb chunks of GRCh38; joined to the node file, where each haplotype steps on the reference. Placement, exactly. Not deletion, per AMY1.             | Works, but heavy for a panel: 0.23 to 1.45 MB of walks and 0.10 to 0.83 MB of nodes, re-bgzipped, for 4 to 7 chunks, about 1 s each |
| `jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38.summary.bed.gz`, the MAF summary | 1,718,866                                     | One row per haplotype per aligned run on GRCh38, 396,363 rows. Reproduces the walks' defb split to the haplotype (4 / 181 / 210). A deletion and a clipped stretch look alike. | Yes: 9 to 37 KB per window in 0.14 to 0.58 s                                                                                        |
| Release `.gbz.db` with `jbrowse.org/demos/hprc/….haplotype-index.f3.db`      | 10,050,412,544 + 5.09 GB                      | What the lanes read. The index's overview classes each haplotype per 4,096 bp bin as absent, variant, partial or reference-like.                                               | Not tested: about 11 requests and 1.6 MB a read by its README                                                                       |
| Release `.gbz`, `.full.maf.gz`, `.paf`, `.gaf.gz`                            | 5.5, 53.4, 18.5 and 15.3 GB                   | The graph and its inputs. The PAF and GAF align contigs to minigraph nodes, not to GRCh38.                                                                                     | No                                                                                                                                  |

## The design

**Format.** The sidecar keeps its six columns and its name. Two things change in
what it holds:

- **Restored rows.** Each ancestor snarl that a kept row names in `PS` and the
  wave callset lacks becomes a row, packed by `packRecord` from the raw record's
  allele lengths. A size change under 1 kb reads as the reference's structure at
  a restored row, because a parent's allele sums every small indel its children
  already report: without that floor AMY1's parent splits its 165
  reference-length haplotypes across a dozen states and the commonest state
  becomes +94 kb. A restored row with fewer than `MIN_CARRIERS` called
  haplotypes is dropped, which removes defb's 5.2 Mb parent.
- **`_`, a third reference-like state.** A no call becomes `_` where the nearest
  ancestor that calls the haplotype exists, in the wave callset or restored. `.`
  then means only that no ancestor calls the haplotype: the graph does not carry
  it through the site.

**Size.** The file stays about 18.5 MB: the published one holds 388,147 rows and
8,169,115 no-call states (4.6% of 179,323,914), and a state stays one character.
The 2026-09-17 count of absent parents is 425, so the restored rows add under
0.3 MB before compression. A window reads one or two more rows.

**Build.** `buildHprcSvStates.sh` already writes the absent parents per
chromosome (`present/$c.named` less `present/$c.txt`). A step after `pack_chrom`
reads each one from the remote `raw.vcf.gz` by a 1 bp region at a child's
position, pipes it through `generatePangenomeSvStates.ts`, and repeats for any
restored row whose own `PS` is absent. A second pass rewrites `.` to `_` by
looking each row's ancestors up by id. At the measured 3.7 to 4.8 s and 27 to 92
MB a parent, 425 parents are about 30 minutes serially and a few minutes at
`JOBS=12`, with no 24 GB download. A wave id carries a `_N` suffix and `;` joins
that the raw id lacks; stripping them matched all 147 rows of the five windows.

**Reader.**

- `pangenomeSvStates.ts`: add the state's constant. `structuralForms` needs no
  rule: `_` is a key character with no size, and `uncalled` already counts `.`
  alone.
- `pangenomePanels.ts`: `structuralPanel` leaves out the form whose key is all
  `.` on every chromosome, so `withoutUncalled` goes. `describeForm` says "not
  aligned at N sites" for `.`, and a deletion says its size through the restored
  row.
- `pangenomeDataset.ts` and `pangenomeAnswer.ts`: `hemizygousChromosomes` goes.
- `scripts/checkPangenomeLaunches.mjs`: `KNOWN_UNPLACED` goes.

Upload the sidecar before deploying the reader: the new reader over the old file
drops UGT2B17's deletion form, while the old reader over the new file only loses
the word for `_`.

**The five windows under it**, simulated with the repo's own `structuralForms`
and `describeForm` over the published rows plus the raw records:

| Window  | Today                                                                       | Proposed                                                                                                        |
| ------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| UGT2B17 | 232 as the reference, 229 skips 8 variant sites                             | 232 as the reference, 229 120 kb deletion                                                                       |
| AMY1    | 255 skips 64 variant sites, 107 skips 1 variant site, 78 79 bp deletion     | 171 as the reference, 52 94 kb deletion, 45 94 kb insertion, 31 79 bp deletion, 13 forms in all; 12 get no lane |
| defb    | 395 skips 1 variant site (HG00097#1, empty lane), 67 as the reference       | 67 as the reference; 395 get no lane                                                                            |
| nphp1   | 6 forms, the last 5 skips 3 variant sites (HG00544#1, empty lane)           | 7 forms, led by 327 not aligned at 2 sites and 43 as the reference, with a 39 kb deletion of 21; 5 get no lane  |
| FLNA    | 190 inversion, 156 as the reference, 116 skips 7 (dropped by the chrX rule) | 190 inversion, 156 as the reference; 116 get no lane, by the general rule                                       |

**What it retires.** All three: `KNOWN_UNPLACED` (both forms are all `.` and get
no lane), `hemizygousChromosomes` with `withoutUncalled` (a deletion spanning a
chrX window reads `_` under a called parent and stays), and "skips N variant
sites".

## The alternative, and why not

A second tabix file of per-haplotype placed intervals already exists: the MAF
summary, 1.7 MB. Dropping a haplotype with no aligned run in the window retires
`KNOWN_UNPLACED` with no build at all, and it is the only source here that
splits defb's 395 into the 185 the graph places and the 210 it does not. It does
not retire the other two workarounds: a deletion spanning a chrX window has no
aligned run either, and nothing in it says "deletion". Deriving that from the
walks instead fails at AMY1, above. Keep the summary in mind for
`representative`, which could prefer the member with the most aligned bases;
that is a second fetch of 9 to 37 KB and a separate change.

## Not measured

- The count of restored rows genome-wide, with ancestors of ancestors, and how
  many of the 8,169,115 no-call states become `_`. Every `_` at the five windows
  climbed one ancestor.
- The 1 kb floor, tried at AMY1, UGT2B17 and nphp1 only.
- The other 17 examples' panels, and any lane in a browser.
  `pnpm check-pangenome-launches` should pass with `KNOWN_UNPLACED` empty; a
  form that is one deletion across its whole window would open a lane with
  nothing in it and be right.
- The build's wall time on the build box, and S3's behaviour under 12 ranged
  readers.
- The haplotype index's overview, which no local install of `@gmod/gbz-base`
  could query.
- The 277 of 19,847 no-call states where the walks and the raw callset disagree:
  260 at AMY1 where a walk steps over a site the parent is missing at, 17 the
  other way.

## Commands

Each read below ran on 2026-10-08 with bcftools and tabix against the remote
files. `$R` is the release prefix above and `$J` is
`https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38`.

```bash
# sizes
curl -s "https://s3-us-west-2.amazonaws.com/human-pangenomics?list-type=2&delimiter=/&prefix=pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/"
curl -sI $J.walks.bed.gz   # and nodes, links, summary

# the callsets: header fields, then a window (wave has no AT; raw and pgbi have no INV)
bcftools view -h $R.wave.vcf.gz | grep -E '^##(INFO|FORMAT|ALT)'
bcftools query -r chr4:68530001-68680000 \
  -f '%POS\t%ID\t%INFO/LV\t%INFO/PS\t%REF\t%ALT[\t%GT]\n' $R.wave.vcf.gz
# raw, with 200 kb of left flank; a record overlapping the region is returned
# even when it starts before it
bcftools query -r chr4:68330001-68680000 -f '<same format>' $R.raw.vcf.gz
bcftools query -r chr8:7650001-7930000 -f '<same format>' $R.raw.vcf.gz
bcftools query -r chr2:109880001-110210000 -f '<same format>' $R.raw.vcf.gz
bcftools query -r chrX:154140001-154440000 -f '<same format>' $R.raw.vcf.gz
bcftools query -r chr1:103410001-103760000 -f '<same format>' $R.raw.vcf.gz
# one parent alone
bcftools query -r chr4:68542449-68542449 -i 'ID=">146679551>146690036"' \
  -f '<same format>' $R.raw.vcf.gz

# the walks: whole chunks, from one chunk before the window to one after
# (two for nphp1), since a row is filed at its chunk's first base
tabix $J.walks.bed.gz 'GRCh38#0#chr8:7733249-8060928'
tabix $J.nodes.bed.gz 'GRCh38#0#chr8:7733249-8060928'
#   chr2:109903873-110362624   chrX:154271745-154533888
#   chr4:68419585-68747264     chr1:103481345-103874560

# the MAF summary and the sidecar
tabix $J.summary.bed.gz chr8:7850001-7930000
tabix https://jbrowse.org/pangenome/hprc-grch38/sv-states/hprc-v2.1-mc-grch38.sv-states.tsv.gz chr8:7850001-7930000
```

The reductions, each a short script over those reads:

- **A walk's reference steps.** A step decodes as the walk file's README says
  (`2 × id + r`, then deltas). A step is on the reference when the node file
  gives its node rank 0 on `GRCh38#0#<chrom>`. Pieces of one path join in
  `piece` order, and a gap in the numbering breaks the chain.
- **Placed, walks.** A haplotype is placed on the reference nodes it steps on
  and on the reference between two consecutive same-strand, colinear reference
  steps of one fragment. "Steps over" a site means such a pair straddles it and
  no step of the haplotype lands in it.
- **Placed, raw callset.** From a sidecar row, strip `_N` and anything after `;`
  from its id, find the raw record, and follow `PS` upward until a record calls
  the haplotype (`_`) or the chain ends (`.`).
- **Forms.** `structuralForms` and `describeForm` as they stand, over the
  window's rows, with the all-`.` form left out for the proposed column.
