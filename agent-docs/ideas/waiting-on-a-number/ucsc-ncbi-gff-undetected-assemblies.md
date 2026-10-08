---
name: ucsc-ncbi-gff-undetected-assemblies
description:
  74 of 238 UCSC configs carry an NCBI RefSeq GFF track; aptMan1 is recoverable
  by a mechanical alias, and nobody has counted how many of the rest share its
  shape.
---

# UCSC assemblies that get no NCBI RefSeq GFF track

`ucsc2jbrowse/src/deriveNcbiAccessions.ts` detects which UCSC assemblies are
NCBI-derived, and 74 committed configs carry a `<db>-ncbiRefSeqGff` track as of
2026-10-08. The design is in `agent-docs/reference/UCSC_PIPELINE.md` under
"Which UCSC assemblies are NCBI-derived is derived, not listed". Two leads
stayed open when it landed on 2026-08-26.

- **aptMan1's refNames are RefSeq accessions under UCSC's dot-to-`v` mangling**
  (`NW_013995860v1` for `NW_013995860.1`), and UCSC publishes no alias table to
  undo it, so the addressability gate drops the assembly. A synthesized alias in
  `ensureAssemblyAliasesAndCytobands` would recover it, and would mean
  manufacturing aliases UCSC does not publish. The number that decides whether
  to build it: how many undetected assemblies have refNames of that shape.
- **About 163 assemblies match no evidence source.** `asmEquivalent` covers 96
  of the 238 and has a refseq row for 58. NCBI's assembly-name search would be a
  fourth source, and needs the same-assembly-not-same-species rule the header of
  `ucsc2jbrowse/ncbiRefSeqAccessions.tsv` describes.

The `assemblyName` column of a `nibPath` row holds the whole description
(`Jan. 2024 (GRCr8/rn8)`). Nothing parses that column.
