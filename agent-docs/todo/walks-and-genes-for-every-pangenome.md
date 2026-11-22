---
name: walks-and-genes-for-every-pangenome
description:
  Give every /pangenomes species what HPRC has: a Minigraph-Cactus graph, a
  format 8 walk file, the walk-cut Bandage drawing, and named gene models on
  every haplotype, so each page can show the genes a reference misses. Fly is
  the proving build.
metadata:
  category: ready
  area: pangenomes
  first_move:
    "Read agent-docs/handoffs/walks-for-every-species.md for the running build,
    then check fly's gates."
  order: 0
---

# Walks and genes for every pangenome

Colin's end goal, from the hazelnut demo (2026-11-18): every species gets gene
models on every haplotype lane, lanes and a walk-threaded graph in one view, and
sites found by scanning for genes inside bubbles. He wants it built toward that
end state with no interim version shipped first; the section is low-traffic
(2026-11-22).

## The scientific message (draft, for Colin)

A reference genome is one individual. Across these eight species, structural
variants between individuals add, remove and duplicate whole genes, including
genes behind traits people already know. Per-haplotype gene models on a
pangenome graph show each one directly, with the haplotypes that carry it.

- **Each page leads with known alleles that test it:** a page earns a claim only
  where the lanes reproduce published biology.
  - rice PSTOL1, present in Kasalath and absent from Nipponbare
  - fly Cyp6g1's Accord insertion
  - Arabidopsis FLC alleles and RPP NLR presence and absence
  - dog RSPO2 and the FGF4 retrogenes
  - cattle POLLED
  - mouse Nnt in C57BL/6J
  - human AMY1 copy number

  The pages' `knownAlleles` carry the citations.

- **The genes-in-bubbles scan then finds what nobody asked about.** It reports
  only what passes the same checks as the known alleles.
- **Absent is not the same as unassembled.** A gene shows as lost only where the
  graph has a deletion there. Where the locus falls in an assembly gap, it shows
  as missing.

## A reviewable pangenome annotation

The gene half aims at annotation a person can review, not only lanes of genes.

- **Curating gene by gene doesn't scale.** Pipelines now annotate a genome
  without a curator, and genomes come in sets of 30 to 400. What still needs a
  person is each call across haplotypes: lost or a failed projection,
  transposon or real gene, duplication or assembly artifact.
- **The status table is the review surface.** Every reference gene gets a
  status per haplotype, with the graph beside it showing why. The pipeline
  produces this anyway. A reviewer accepts or overrides the uncertain calls,
  starting with the known-allele loci.
- **No editing application before the data.** Build the data and the view
  first, then watch what a review needs. That is probably a status override
  and a note per gene per haplotype, far less than a full annotation editor.
  Colin's view (2026-11-22) is that the Apollo project is stuck on software
  engineering; this direction aims to avoid that.

## Open: where this lives

The product is data and a method:

- uniform Minigraph-Cactus graphs, walk files, and per-haplotype gene calls
  with statuses for eight species
- the checks that show they are right

That data is citable as a data paper or preprint, whatever pages display it.
genomes.jbrowse.org's job is every assembly one click away. A pangenome
annotation effort may need its own home and release pace. None of the
builds depend on the answer: the files sit under `jbrowse.org/demos/` and any
page can read them. Hold new /pangenomes page work, beyond what is needed to
look at results, until the deliverable and its audience are decided.

## Why rebuild every graph

- **The minigraph graphs record no paths.** Seven species were built with
  `minigraph -cxggs`, which records no per-assembly path, so
  `gfa-to-tabix --walks` has nothing to read.
- **Cow's published Cactus graph is unusable.** Leonard et al.'s Zenodo
  `cactus/*.gfa` is Progressive Cactus v2.3.0 with ancestral genomes. Its
  reference path revisits 181,357 nodes on chr29 alone, so a walk file built
  from it would place haplotypes by guesswork.
- **Minigraph-Cactus keeps the reference acyclic** unless `--collapse` is
  passed. HPRC's format 8 file reads `revisited:i:0`.
- **The node-and-link drawing is not the target.** A prototype drew from
  `.graph.bed.gz` with graph-walks' `rgfaCut`, and its 77 cuts matched their
  source rGFAs exactly. But it lacks haplotype highlights and depth widths, so
  it stays a measurement, not a page.

## Graph build

`build_mc.sh` (scratch copy on ada at `/mnt/sdb/cdiesh/build_mc.sh`; it moves to
jbrowse-components `scripts/` once fly passes) does one species per run:

- **Image:** cactus v4.0.0 by digest (`sha256:fb66c681…`), run through
  apptainer. Before each multi-day species, switch to a newer release if one is
  out: fixes to telomere anchors and to determinism are merged but unreleased.
- **Names:** the reference takes no suffix and comes out `dm6#0#chrX`, as HPRC's
  `GRCh38#0`. Members are named `<sample>.1` in the seqfile so they come out
  `#1`. Dog's paired assemblies become one diploid sample (`.1` and `.2`).
  Arabidopsis's dotted names (`Col-0.6909`) need an explicit haplotype, or
  cactus reads the dot as one.
- **Command:**
  - `--gfa clip full --vcf --validate --maxMemory`, under a systemd scope cap
  - no `--hal`, which isn't an option (the HAL is written as `<out>.full.hal`)
  - no `--collapse`
- **Toil's logging thread can quit after the last job** and fail a run whose
  work is done, as the smoke test did. The script resumes with `--restart` and
  never deletes the job store.
- **Order:**
  - fly first, at least a day
  - Arabidopsis, rice, dog and mouse next; dog and mouse each get a chr1 pilot
    first to measure peak memory against 125 GB
  - tomato (seven wild species) and cow (yak, bison, gaur) last, each after a
    one-chromosome pilot that measures the clipped fraction per genome and
    decides which members belong

## Gates

A gate refuses to publish on any of these:

- `<out>.WARNING` exists, or `--validate` fails
- a genome's clipped or unassigned fraction is above the ceiling
  (`<out>.stats/clipped-by-genome.tsv`), with the ceiling set from fly
- the reference path length differs from the chrom sizes
- the walk header shows `revisited` other than 0, or a haplotype count that
  differs from the seqfile's or is zero
- carriers read from the walks disagree with the existing `minigraph --call`
  callsets at the pages' known alleles

`walks-truth.py rebuild` checks the conversion and graph-walks `release-check`
checks the reader. Renders go to Colin before anything lands.

## Genes

A survey picked the tools, then a review checked them against the pages'
featured loci (2026-11-22). The review found that importing Ensembl and 1001G+
lanes and filtering novel genes by "doesn't align to the reference" give wrong
answers at Mx1, Nnt, RPP5 and the fly TE alleles. The method below is the
reviewed one.

- **One projection for every panel:** LiftOn 1.0.14 from the reference
  annotation onto every member, mouse and Arabidopsis included, run on the
  same `.pansn.fa` files as the graph. Flags: `-copies -sc 0.95 -polish
  --no-adaptive-rescue-floor --no-rescue-second-locus`, so thresholds are the
  same for every haplotype. Cache `liftoff.gff3` and `miniprot.gff3` for
  reruns.
- **Status comes from LiftOn plus the walks**, since LiftOn alone doesn't
  give a reason for an unmapped gene:
  - **intact**
  - **altered:** LiftOn's `mutation` field
  - **deleted:** the walk crosses both flanks and skips the CDS
  - **not assembled:** no walk over the flanks
  - **unresolved**

  This table is the review surface.

- **Genes the reference lacks:**
  - Take them from published sets first: 1001G+ pan-genes, PanOryza's
    non-reference pan-genes for rice, and the RefSeq genes of the annotated
    dogs and cattle.
  - Add Tiberius 2.0.9, with unmasked models (`insecta`, `angiosperms`,
    `mammalia_nosofttmasking_v2`), labelled as predicted.
  - Filter at gene level: drop models overlapping a lifted CDS and drop TE
    protein hits; a match to a reference protein counts as an extra copy of
    that gene; require non-TE homology.
  - Cluster the union once, then align it to every haplotype with miniprot,
    as pangene does, so presence comes from alignment.
- **A reference with the derived allele** (C57BL/6J's Nnt, mouse Mx1, CHKov1)
  needs its own rule, written and tested before the run. Projection alone
  shows these genes the wrong way round.
- **Stable IDs:** the reference gene ID for projected genes, position rank
  for copies, and a committed registry of representative proteins for novel
  genes, so IDs survive a graph rebuild.
- **Ensembl, 1001G+ and the partial RefSeq sets are truth sets, not lanes.**
  Mixing pipelines in one panel turns pipeline differences into false losses:
  2,497 AGI-named genes have no 1001G+ model even in Col-0.
- **Validation:**
  - before any run, the per-locus pass/fail table for the featured known
    alleles (in the review's report)
  - null lifts: GRCm39 onto the B6J T2T assembly, TAIR10 onto Col-0 6909
  - every "deleted" call matched to a graph deletion, and every frameshift
    to a VCF indel
  - a ceiling on the TE share of the novel set
  - OMArk per proteome

  BUSCO and compleasm pass all the failures the review found, so they're
  context, not gates.

- **Frameshift calls may follow sequencing technology:** 12 of 29 fly members
  are ONT-only, so "altered" needs that context before anyone reads it as
  biology.
- **Cost and order:**
  - LiftOn about 6 days at 24 threads; Tiberius about 180 GPU-hours, roughly
    3 days on the two A6000s for the mammals
  - first, a Tiberius container test (`--nv` under ada's apptainer is
    untested) and one LiftOn run on a fly member
  - then fly as the full pilot, gated on its rows of the table; then
    Arabidopsis and mouse, then the rest
  - status waits for each panel's graph; LiftOn and Tiberius don't
- **Not CAT:** its de novo genes are unnamed, its other modes need RNA-seq or
  IsoSeq, and its last release was 2020.

## The known-allele gate

Each featured locus's expected gene lane, from the review. A panel's genes ship
only when its rows pass. The last column is what the survey's first method
would have shown.

| page        | locus                            | expected in a gene lane                    | first method would show                                                                 |
| ----------- | -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| mouse       | Nnt                              | 21-exon gene in every strain but B6J       | fails: 17 exons, 835 aa everywhere                                                      |
| mouse       | Mx1                              | full gene in CAST, WSB, PWK, JF1, NZO, CBA | fails: unnamed in four, truncated in CBA                                                |
| mouse       | Pde6b rd1                        | nonsense codon in FVB, C3H, CBA            | no status from an import                                                                |
| mouse       | dilute, nonagouti, rd1 provirus  | gene unchanged, insertion in an intron     | correct, if provirus ORFs are filtered                                                  |
| Arabidopsis | RPP5 cluster                     | RPP4, SNC1, RPP5 and their copies          | fails: no models in Col-0                                                               |
| Arabidopsis | RPP1 cluster                     | paralogs, varying in number                | partly: several unnamed                                                                 |
| Arabidopsis | RPM1, RPS5                       | no gene in the listed accessions           | likely correct; test it                                                                 |
| Arabidopsis | FLC, MAM1/MAM3                   | gene present                               | correct                                                                                 |
| fly         | Cyp28d1                          | 2 or 3 copies in A2, B1, B4                | fails without `-copies -sc 0.95`                                                        |
| fly         | Strn-Mlck c¹, plexus px¹         | disrupted in BDSC_156                      | untested; DM412 pol likely drawn as a novel gene                                        |
| fly         | garnet, forked, raspberry, white | gene unchanged                             | TE ORFs likely drawn as novel genes                                                     |
| fly         | CHKov1                           | intact in the 7 strains without the Doc    | likely reversed                                                                         |
| fly         | Cyp6g1, Bari-Jheh                | no gene-level claim                        | correct                                                                                 |
| rice        | sd1-d, dep1                      | disrupted in the listed lines              | should work; test it                                                                    |
| rice        | GL7                              | second copy in SL039 and FNA               | fails without `-copies`                                                                 |
| rice        | PSTOL1                           | one kinase gene in Kasalath and SL190      | found if Tiberius calls it; unnamed from Swiss-Prot; surrounded by TE ORFs              |
| rice        | qSW5                             | no gene-level claim                        | correct                                                                                 |
| tomato      | CSR-D                            | disrupted in Heinz, M82, TS-60, TS-9, VF36 | should work; test it                                                                    |
| tomato      | ENO promoter                     | no gene-level claim                        | correct                                                                                 |
| dog         | RSPO2                            | 3' UTR 167 bp longer                       | correct                                                                                 |
| dog         | FGF4 retrogenes                  | extra intronless FGF4                      | uncertain: LiftOn's rescue has a processed-pseudogene filter; the page found no carrier |
| cattle      | POLLED, KIT, ASIP                | no gene-level claim                        | correct                                                                                 |
| cattle      | BoLA, CATHL, DEFB                | copy number varies                         | noisy; needs the copy rule                                                              |

## Site work, after the data

- `walksUrl` per dataset, so forms, the graph and the lanes read walks.
- Haploid members' sidecar and callset rows say `KSA2` where the walks say
  `KSA2#1`. Known alleles and the matrix must match on the same name.
- Per-haplotype gene tracks in each lane config, and the gene step on the
  Bandage drawing.
