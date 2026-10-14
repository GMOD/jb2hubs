---
name: ucsc-ncbi-gff-undetected-assemblies
description:
  74 of 238 UCSC configs have an NCBI RefSeq GFF track; a mechanical alias would
  recover aptMan1, and nobody has counted how many of the rest have refNames in
  the same mangled form.
---

# UCSC assemblies that get no NCBI RefSeq GFF track

`ucsc2jbrowse/src/deriveNcbiAccessions.ts` detects which UCSC assemblies are
NCBI-derived, and on 2026-10-08, 74 committed configs had a `<db>-ncbiRefSeqGff`
track. `agent-docs/reference/UCSC_PIPELINE.md` describes the design under
"`deriveNcbiAccessions.ts` decides which UCSC assemblies are NCBI-derived". Two
leads stayed open when it landed on 2026-08-26.

- **aptMan1's refNames are RefSeq accessions under UCSC's dot-to-`v` mangling**
  (`NW_013995860v1` for `NW_013995860.1`), and UCSC publishes no alias table to
  map them back, so the addressability gate drops the assembly. A synthesized
  alias in `ensureAssemblyAliasesAndCytobands` would recover it, at the cost of
  publishing aliases UCSC does not. The number that decides whether to build it
  is how many undetected assemblies have refNames of that form.
- **About 163 assemblies match no evidence source.** `asmEquivalent` covers 96
  of the 238 and has a refseq row for 58. NCBI's assembly-name search would be a
  fourth source, and would need the same-assembly-not-same-species rule the
  header of `ucsc2jbrowse/ncbiRefSeqAccessions.tsv` describes.

The `assemblyName` column of a `nibPath` row holds the whole description
(`Jan. 2024 (GRCr8/rn8)`), and no code parses that column.
