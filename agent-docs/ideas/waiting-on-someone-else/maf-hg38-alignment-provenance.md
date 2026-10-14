---
name: maf-hg38-alignment-provenance
description:
  MAF row-to-genome navigation on the hg38 cactus and multiz tracks waits on a
  per-species assembly accession list from Zoonomia and the Hiller lab.
---

# Assembly provenance for the hg38 multi-species alignments

A MAF row can open its species' own genome in a new view when the sample carries
`assemblyName` + `assemblyConfigLocation`
(`agent-docs/reference/MAF_CROSS_VIEW_NAVIGATION.md`). mouseStrains has it. The
hg38 cactus and multiz alignments cannot, because a species name does not say
which assembly the alignment used (the reference's table has the counts).
`Acinonyx jubatus` alone has three assemblies in `searchIndex.json`, and a jump
to the wrong one draws wrong coordinates with no error. The mapping has to come
from Zoonomia's published accession list for cactus241/447way and from the
Hiller lab's assembly table for multiz470way. The plugin fields are ready; once
a table exists, the resolver `processMouseStrainsHub.ts` passes to
`createTrackConfiguration.ts` is the model for the hg38 one.
