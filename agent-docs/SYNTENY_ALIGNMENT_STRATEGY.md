# Synteny alignment strategy for the multi-way gene-order view

Decision-oriented notes for `/synteny-multi` (the multi-way, tree-ordered
ortholog neighborhood view) and its JBrowse drill-downs.

## The problem

The **overview** is ortholog-based and needs no genome alignment — gene loci +
NCBI orthology give the arrows and ribbons. **Base-level alignment is only
needed in the drill-downs** (pairwise `LinearSyntenyView`, or a stacked subtree
view). Today those use the precomputed chain catalog (`synteny_pairs.json`), but
it is sparse: 111 GCF×GCF pairs, **none involving human** — UCSC's rich hg38
chains are UCSC-db-named (`hg38`, `mm39`) and the catalog generator keeps only
GCF×GCF, so they're excluded. So for the common human-referenced query the
drill-down falls back to single-genome. This doc is how to fix that.

## How the established viewers source alignments (cross-reference)

- **NCBI MCGV** (multiple-genome): default is **Ensembl EPO**
  (Enredo-Pecan-Ortheus), reference-anchored to GRCh38. Reference-free *within*
  a clade but produced per-clade and clade-limited (8-way primate, 17-way
  placental, 4-way sauropsid, 5-way teleost).
- **NCBI CGV** (pairwise): Mash picks distance → **BLAST or LASTZ** on NCBI's
  assembly-alignment pipeline for same-species + close cross-species;
  **additional cross-species alignments are imported from UCSC and HPRC**.
- **Cactus / HAL + `halSynteny`**: one reference-free **HAL** multiple alignment
  yields *any* pair's synteny blocks via `halSynteny` (and `halLiftover` for
  annotation). Already run on the **Zoonomia 447-way** mammalian HAL.
- **UCSC multiz**: reference-anchored MAF (e.g. hg38 100-way), rendered natively
  by JBrowse `LinearMafDisplay`. This repo already uses the 100-way (gene
  explorer, F12 figure).

## Recommended 3-tier strategy

Resolve a drill-down's alignment by falling through:

1. **Precomputed chain** — `synteny_pairs.json` when a pair exists (current).
2. **Extract from an existing multiple alignment** — the main lever, zero new
   per-pair compute:
   - **Mammals → Zoonomia 447-way HAL + `halSynteny`/`halLiftover`.**
     Reference-free, broadest coverage, what the Cactus ecosystem uses. Superior
     to EPO for breadth (447 vs 8–17 species).
   - **Vertebrates / human-ref → multiz hg38 100-way MAF.** Already hosted;
     JBrowse renders it natively; no conversion needed if the drill-down opens a
     MAF view rather than a pairwise ribbon.
   - EPO is viable (it's the MCGV choice) but clade-limited; prefer the 447-way
     HAL where a HAL is available.
3. **On-the-fly `minimap2 -x asm20`** on the focused gene window for species in
   no big alignment. Tractable *because* the view is locus-scoped (two ~1 Mb
   windows align in well under a second) — whole-genome on-the-fly would not be.
   Cache the PAF like neighborhoods are cached.

## Connective tissue: assembly alias registry

The tiers only compose if an ortholog's NCBI **GCF accession** can resolve to
the **UCSC db** (chains, multiz) or **Ensembl name** (EPO) that hold its
alignment. Build a curated canonical registry — canonical = NCBI accession;
aliases = UCSC db + Ensembl + common names — for the finite set of model
organisms, and reuse JBrowse `refNameAliases` for within-assembly coordinate
mapping (`chr1 ≡ NC_000001.11 ≡ 1`). jb2hubs already ingests both UCSC dbs and
GenArk accessions, so it's the natural home.

Caveat: `hg38` and `GCF_000001405.40` are the *same assembly for
gene/synteny/orthology cross-referencing* but **not byte-identical** (UCSC
patches, alt loci, chrM). Scope the equivalence accordingly.

**Attempted (2026-06), blocked — why a quick map isn't enough.** `syntenyTracks.json`
has 2971 pairwise tracks (531 involve `hg38`, 156 `mm39`), but they're keyed in
**UCSC-db / GenBank-GCA** assembly space (e.g. `['GCA_000152225.2','hg38']`),
while NCBI orthology gives **RefSeq GCF accessions + NC_ refnames**. A JBrowse
`LinearSyntenyView` track only binds when its `assemblyNames` match the loaded
assemblies, and a GCA-named chain won't bind a GCF-loaded genome (nor will a GCF
NC_ locus navigate on a GCA assembly). So aliasing must operate at the
**assembly-identity** level (GCA↔GCF↔UCSC-db as one assembly, with
`refNameAliases`), not just a name map — and even then the chain's coordinate
space differs. `generateSyntenyPairIndex` filters to GCF×GCF precisely because of
this; dropping the filter exposes the pairs but they still can't be launched
without the identity layer. Net: the robust human alignment path is the hosted
**447-way Cactus MAF** (already shipped via the `/synteny-multi` button), and
`mm39` has no equivalent hosted multi-way multiz in jb2hubs, so the
pairwise-chain bridge is deferred until the assembly-identity registry exists.

## Smallest first prototype

**Human-ref drill-down → launch the hosted multiz hg38 MAF at the gene locus**
(JBrowse `LinearMafDisplay`). No compute, no chain catalog, no alias registry
needed for the human case — it delivers a real base-level multi-species
alignment immediately and sidesteps the catalog gap. Sequence after that:
alias registry → `halSynteny` service for arbitrary mammal pairs → minimap2 long
tail.

Note `halSynteny`/`hal2maf` are C++ binaries (HAL toolkit), not Lambda-friendly
— they want a small container / batch job, unlike the pure-JS ortholog
assembler.

## Sources

- NCBI MCGV help (EPO default): https://www.ncbi.nlm.nih.gov/mcgv/cm/mcgv/help
- NCBI CGV paper (BLAST/LASTZ; UCSC/HPRC imports): https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3002405
- CGV (bioRxiv): https://www.biorxiv.org/content/10.1101/2023.10.30.564672v1.full
- halSynteny (GigaScience): https://academic.oup.com/gigascience/article/9/6/giaa047/5848161
- Ensembl EPO (comparative genomics): https://pmc.ncbi.nlm.nih.gov/articles/PMC4761110/
