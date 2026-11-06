---
name: antibody-locus-caveat-on-the-hprc-pages
description: HPRC haplotypes come from lymphoblastoid cell lines, whose V(D)J recombination deletes stretches of IGH, IGK and IGL, so a lane gap there is often the cell line, not the person. A locus flag read by the region box and the lane headers would say so where it applies.
---

# An antibody-locus caveat on the HPRC pages

HPRC's haplotypes come from lymphoblastoid cell lines, whose V(D)J
recombination deletes stretches of the IGH, IGK and IGL loci. A haplotype with
no step on the reference there is often the cell line's deletion rather than
the person's genome. The HPRC tutorials' limits sections say so in prose; a
reader landing on those loci from the region box sees nothing.

Sketch: a `vdjDeletions`-style flag on those loci, read by the region box and
the lane headers, so the caveat appears where it applies.
`pangenomeLinks.ts`' `onFlaggedLocus` already reads per-locus flags
(`graphCollapsed`, `callsetBlank`), so the flag joins that union. IGH, IGK and
IGL are not among the curated loci in `pangenomeLoci.ts`, so they would be
added as flag-only loci first. Small; few readers land there.

Picked up from jbrowse-components' HPRC-limits handoff (closed 2026-11-06).
