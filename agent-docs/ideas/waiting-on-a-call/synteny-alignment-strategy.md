---
name: synteny-alignment-strategy
description:
  Where a gene-order drill-down gets base-level alignment for a pair we host no
  chain for — extract from Zoonomia's HAL or the hg38 multiz, or align on the
  fly. Pick a tier.
---

# Alignment sources for gene-order drill-downs

The gene-order figure (`GeneOrderSection.tsx`, drill-downs in
`multiSyntenyDrilldown.ts`) builds its rows from orthologs and needs no genome
alignment. Its drill-downs, a pairwise `LinearSyntenyView` or a stacked subtree,
do need one, and they read it from the precomputed chain catalog,
`synteny_pairs.json`.

## Pairs the catalog cannot link

`generateSyntenyPairIndex.ts` resolves UCSC db names to accessions through
`ortholog_index.json`, so the 586 tracks naming hg38 are in the catalog
(`agent-docs/reference/SYNTENY_PAIR_NAMES.md`). What remains:

- **A species with no chain to its neighbour** gets no ribbon. UCSC chains are
  star-shaped around a few references (hg38, mm39), so `planMultiSynteny`'s
  stacks stay short away from those references.
- **A level whose link contradicts a settled name** keeps its slot but loses its
  track (`resolveStackNames` in `syntenyPairIndex.ts`).

## How the established viewers source alignments

- **NCBI MCGV** (multiple-genome): **Ensembl EPO**, reference-anchored to
  GRCh38, produced per clade (8-way primate, 17-way placental, 4-way sauropsid,
  5-way teleost).
- **NCBI CGV** (pairwise): Mash picks a distance, then **BLAST or LASTZ**;
  further cross-species alignments are imported from UCSC and HPRC.
- **Cactus HAL + `halSynteny`**: one reference-free multiple alignment yields
  any pair's synteny blocks (`halLiftover` for annotation). Run on the
  **Zoonomia 447-way** mammalian HAL.
- **UCSC multiz**: reference-anchored MAF (hg38 100-way), which JBrowse renders
  with `LinearMafDisplay`.

## Three tiers to fall through

1. **Precomputed chain**, from `synteny_pairs.json` (today).
2. **Extract from a multiple alignment**, no new per-pair compute:
   - mammals → Zoonomia 447-way HAL with `halSynteny`/`halLiftover`, broader
     than EPO (447 species against 8–17). Build plan:
     `agent-docs/ideas/waiting-on-a-call/halsynteny-extraction-pipeline.md`;
   - human-referenced → the hg38 100-way MAF, opened as a MAF view rather than a
     pairwise ribbon.
3. **`minimap2 -x asm20` on the focused window** for species in no big
   alignment. Two ~1 Mb windows align in well under a second, which is fast
   enough only because the view covers one locus. Cache the PAF as the
   neighborhoods are cached.

The smallest first step is tier 2's MAF half: a human drill-down that opens the
hosted hg38 100-way at the gene, with no compute and no catalog change. No code
in `website/src` launches a MAF view yet.

## Identity across naming schemes

The tiers compose only if an ortholog's GCF accession resolves to the UCSC db
(chains, multiz) or Ensembl name (EPO) holding its alignment.
`website/src/utils/ucscMapping.ts` and `ortholog_index.json`'s `ucscDb` map
cover the UCSC half; Ensembl names have no mapping. `hg38` and
`GCF_000001405.40` are the same assembly for orthology but not byte-identical
(UCSC patches, alt loci, chrM).

`halSynteny` and `hal2maf` are C++ binaries (HAL toolkit), so tier 2's HAL half
needs a container or batch job instead of a Lambda.

## Sources

- NCBI MCGV help (EPO default): https://www.ncbi.nlm.nih.gov/mcgv/cm/mcgv/help
- NCBI CGV paper (BLAST/LASTZ; UCSC/HPRC imports):
  https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3002405
- CGV (bioRxiv):
  https://www.biorxiv.org/content/10.1101/2023.10.30.564672v1.full
- halSynteny (GigaScience):
  https://academic.oup.com/gigascience/article/9/6/giaa047/5848161
- Ensembl EPO (comparative genomics):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4761110/
