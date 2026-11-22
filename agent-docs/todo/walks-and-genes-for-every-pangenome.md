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

Proposed by a survey (Tiberius, BRAKER, Helixer, Liftoff, LiftOn, miniprot,
TOGA, CAT, EGAPx, and the members' existing annotation); under review before any
GPU time is spent:

- **Projection:** LiftOn from the reference annotation onto every member. Each
  gene keeps its reference ID and symbol, with a status per haplotype: intact,
  disrupted, absent, or missing in a gap.
- **Genes the reference lacks:** Tiberius on ada's GPUs, kept only in sequence
  that doesn't align to the reference, clustered into pan-gene IDs and named by
  protein hit.
- **Imports:** 1001 Genomes Plus for all 26 Arabidopsis accessions; Ensembl 116
  for 16 mouse strains.
- **Truth sets, not lanes:** members with a partial annotation of their own (dog
  RefSeq, cattle Brahman and Angus, rice Udai21, tomato LA1589), so every lane
  in a panel comes from one pipeline.
- **Not CAT:** its de novo genes are unnamed, its other modes need RNA-seq or
  IsoSeq, and its last release was 2020.

## Site work, after the data

- `walksUrl` per dataset, so forms, the graph and the lanes read walks.
- Haploid members' sidecar and callset rows say `KSA2` where the walks say
  `KSA2#1`. Known alleles and the matrix must match on the same name.
- Per-haplotype gene tracks in each lane config, and the gene step on the
  Bandage drawing.
