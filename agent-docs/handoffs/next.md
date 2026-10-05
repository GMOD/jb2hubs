# Handoff, 2026-09-30

The 2026-09-24 handoff's work all shipped: the 2026-09-27 `run.sh` deployed
production and staging, and 29,567 GenArk configs now carry `annotationSource`.

Open:

- **Stale GFFs.** 50 remain (`staleNcbiGffs.ts`); the next `run.sh` fetches them
  under `STALE_GFF_MAX`.
- **Pangenome placement.** `defb` HG00097#1 and `nphp1` HG00544#1 are listed as
  known unplaced by `check-pangenome-launches`. Per-haplotype placement must
  exist before `features.pangenome` leaves staging; the defb measurement to run
  first is in `agent-docs/reference/PANGENOME_PORTAL.md`.
- **Late October:** read the ortholog Lambda logs (`todo/slowness-synteny.md`).
- `todo/prune-unreferenced-derived-files.md` and `todo/proteinbrowser.md` are
  unchanged.

Settled 2026-09-30: the 12-genome cap stays (readability, not url length), UCSC
rows keep UCSC's organism field, and the p2s_mapper `toAuthorRange` fix is not
worth pushing. SIFTS segments are consecutive in UniProt numbering but not in
author numbering (1PPB chain H: 258 UniProt residues, 231 author numbers), so
deriving a shift from the end is as wrong as deriving it from the start. Nothing
here calls `toAuthorRange` any more.
